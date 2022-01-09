import { request, RequestOptions } from 'http'
import { Pool, QueryConfig, QueryResult } from 'pg'
import dotenv from 'dotenv'
import Job from './monitorItem/MonitorItem'

dotenv.config()

interface RequestError extends Error {
  code: any
}

export class ConnectionResult {
  constructor(
    public readonly result: iRequestResults,
    public readonly data?: Buffer,
    public readonly latency?: DOMHighResTimeStamp,
    public readonly error?: RequestError
  ){}
}

interface MonitorItem {
  panel: Panel
  connections: {
    requestOptions: RequestOptions,
    requestResult?: ConnectionResult }[]
}

const pool = new Pool()

const getPanelQuery: QueryConfig = {
  text: 'SELECT * FROM storage_monitor_list',
  name: 'storage monitor list'
}

const insertText = /* SQL */`
INSERT INTO storage_monitor (storage_id, storage_code, query_time, response_bytes, latency, result)
VALUES ($1, $2, $3, $4, $5, $6)
`

const getPanels = async (): Promise<QueryResult<iMonitorListItem>> => {
  const result = await pool.query(getPanelQuery)
  return result
}

async function getJobs() {
  const { rows } = await getPanels()
  return rows.map(p => new Job(p))
}

function promiseRequest(options: RequestOptions): Promise<ConnectionResult> {
  return new Promise((resolve, reject) => {
    const perfStart = 'start-marker'
    const perfEnd = 'end-marker'
    const buffer: Buffer[] = []
    const req = request(options)

    req.on('response', res => {

      performance.mark(perfEnd)
      const latency = +(performance.measure(perfStart, perfEnd).duration * 1000).toFixed(0)

      const authError = res.headers?.connection === 'close'

      if (authError) {
        const result = new ConnectionResult("autherror", undefined, latency)
        resolve(result)
      }

      res.on('data', ch => buffer.push(ch))

      res.on('end', () => {
        const fullBuffer = Buffer.concat(buffer)
        const result = new ConnectionResult('success', fullBuffer, latency)
        resolve(result)
      })

      res.on('error', e => {
        console.log('Response Error!!\n')
        throw e
      })

    })

    req.on('error', (e: RequestError)  => {
      const result = new ConnectionResult('error', undefined, undefined, e)
      resolve(result)
    })

    req.on('timeout', () => {
      const result = new ConnectionResult('timeout', undefined, undefined, undefined)
      resolve(result)
    })

    req.end(() => performance.mark(perfStart))
  })
}

interface JobsState {
  initial: Job[]
  hostUnreachable: Job[]
  connectionRefused: Job[]
  authError: Job[]
  unknownLogins: Job[]
  success: Job[]
  timedOut: Job[]
  initialCount: number
  attempted: number
  currentJobType: string
  beginTimeMs: number
}

const jobs: JobsState = {
  initial: [],
  hostUnreachable: [],
  connectionRefused: [],
  authError: [],
  unknownLogins: [],
  success: [],
  timedOut: [],
  initialCount: 0,
  attempted: 0,
  currentJobType: 'Initial Attempts',
  beginTimeMs: Date.now()
}

function sortResult(job: Job, response: ConnectionResult) {

  if (response.result === 'autherror') {
    jobs.authError.push(job)
  }
  
  if (response.result === 'success') {
    jobs.success.push(job)
  }
  
  if (response.result === 'timeout') {
    jobs.timedOut.push(job)
  }

  if (response.result === 'error') {
    switch (response?.error?.code) {
      case "EHOSTUNREACH":
        jobs.hostUnreachable.push(job)
        break
      case "ECONNREFUSED":
        jobs.connectionRefused.push(job)
        break
      case "ETIMEDOUT":
        jobs.timedOut.push(job)
        break
      default:
        console.log('UNKNOWN ERROR!')
        console.log(response)
        break
    }
  }

  const currentJobTypeCount = jobs.currentJobType === 'Initial Attempts' ? jobs.initial.length : jobs.authError.length
  // console.clear()
  // console.log(
  //   `
  //   Status:
  //     Jobs Attempted: ${jobs.attempted},
  //     Total Initial Jobs: ${jobs.initialCount},
  //     Total Auth Retry Jobs: ${jobs.authError.length},
  //     Total Host Unreachable: ${jobs.hostUnreachable.length},
  //     Total Timed Out: ${jobs.timedOut.length},
  //     Total Connection Refused: ${jobs.connectionRefused.length},
  //     Total Successful: ${jobs.success.length},
  //     Current Job Type: ${jobs.currentJobType}, remaining: ${currentJobTypeCount},

  //     Time Started: ${new Date(jobs.beginTimeMs)}, Time Elapsed: ${(Date.now() - jobs.beginTimeMs) / 60}m
  // `)
}

async function main() {

  const beginTime = new Date(Date.now())

  jobs.initial = await getJobs()
  jobs.initialCount = jobs.initial.length

  let job: Job | undefined

  while (job = jobs.initial.shift()) {
    const connection = job.getCurrentConnectionOptions()

    if (!connection) {
      console.log('didnt get job')
      continue
    }

    jobs.attempted++
    const response = await promiseRequest(connection.requestOptions)
    
    sortResult(job, response)
    
    job.handleResult(response)
  }
  
  while (job = jobs.authError.shift()) {
    
    const connection = job.getCurrentConnectionOptions()
    
    if (job.info.unknownLogin) {
      jobs.unknownLogins.push(job)
      continue
    }
    
    if (!connection) {
      console.log('didnt get job')
      continue
    }
    
    jobs.attempted++
    const response = await promiseRequest(connection.requestOptions)

    sortResult(job, response)

    job.handleResult(response)

  }

  console.log('Initial Jobs: ', jobs.initial.length)
  console.log('Auth Error jobs: ', jobs.authError.length)
  console.log('Unknown login jobs: ', jobs.unknownLogins.length)
  console.log('Timeout jobs: ', jobs.timedOut.length)
  console.log('Host Unreachable: ', jobs.hostUnreachable.length)
  console.log('Connection Refused: ', jobs.connectionRefused.length)
  console.log('Success jobs: ', jobs.success.length)

  return
}

main()