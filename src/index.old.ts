import http from 'http'
import { Pool, QueryConfig, QueryResult } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

class Result {
  constructor (
    public readonly result: iRequestResults,
    public readonly storage: ConnectionItem,
    public readonly data?: Buffer,
    public readonly latency?: PerformanceMeasure,
    public readonly error?: ConnectionError
    ){}
}

type ConnectionItem = http.RequestOptions & {
  panel: iParsedPanel,
  connectionTracking: ConnectionTracking
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

const DEFAULT_LOGINS = [
  { username: 'agri', password: '7008' },
  { username: 'agri', password: 'stor' },
  { username: 'btu', password: '7564' }
]

const authErrorPanels = []

const getPanels = async (): Promise<QueryResult<iMonitorListItem>> => {
  const result = await pool.query(getPanelQuery)
  return result
}

async function main() {

  const { rows } = await getPanels()

  // parse the logins
  const panels: Panel[] = rows.map(panel => {
    const logins: { username: string, password: string }[] = []
    panel.logins.forEach((login: string) => {
      const match = /^\w+?\/+\w+$/.exec(login)
      if (match) {
        const [_, username, password] = match
        logins.push({ username, password })
      }
    })
    logins.concat(DEFAULT_LOGINS)
    return { ...panel, logins }
  })

  async function getTrackingObject(panel: Panel) {

    const [hostname, port] = panel.url.split(':')

    const options = panel.logins.map(({username, password}) => {
      return {
        family: 4,
        method: 'GET',
        hostname,
        port,
        auth: `${username}:${password}`,
        path: 'fulldata.dat?a=100&b=100&c=0&d=100&e=0&f=en',
        timeout: 15000
      }
    })

    return {
      panel,
      options,
      connectionResults: []
    }
  }




  const markerMainStart = 'mainStart'
  const markerMainEnd = 'mainEnd'
  performance.mark(markerMainStart)
  const { rows: panelsArr } = await getPanels()


  // map them into RequestOptions
  // these are the initial options that get mutated as it is looped through
  // const options: ConnectionItem[] = parsedPanels.map(panel => {

  //   const [hostname, port] = panel.url.split(':')
  //   const connectionTracking: ConnectionTracking = {
  //     attempts: 0,
  //     authError: false,
  //     authErrorCount: 0,
  //     lastAttemptedLogin: null,
  //     usingDefaultLogin: false,
  //     currentLogin: panel.logins[0]
  //   }

  //   const auth = `${connectionTracking.currentLogin.username}:${connectionTracking.currentLogin.password}`

  //   return {
  //     panel,
  //     connectionTracking,
  //     family: 4,
  //     method: 'GET',
  //     hostname,
  //     port,
  //     auth,
  //     path: 'fulldata.dat?a=100&b=100&c=0&d=100&e=0&f=en',
  //     timeout: 15000
  //   }
  // })

  async function* getPanelData(panels: any[]) {
    
    const asyncRequest = (panel: any): Promise<Result> => {

      const markerBegin = 'begin'
      const markerEnd = 'end'
      const data: Buffer[] = []

      return new Promise((resolve, reject) => {
        const request = http.request(panel)
        request.on('response', (res) => {

          // if auth error
          const closeConnectionHeader = res.headers?.connection === 'close'

          if (closeConnectionHeader) {
            panel.connectionTracking.authError = true
            panel.connectionTracking.authErrorCount++

            const result = new Result("autherror", panel)
            reject(result)
          }

          performance.mark(markerEnd)
          const latency = performance.measure('latency', markerBegin, markerEnd)
          res.on('data', buf => data.push(buf))

          res.on('end', () => {
            const fullData = Buffer.concat(data)
            const result = new Result("success", panel, fullData, latency)
            resolve(result)
          })

          res.on('error', (e) => {
            const result = new Result("error", panel, undefined, undefined, e)
            reject(result)
          })
        })

        request.on('timeout', () => {
          const result = new Result("timeout", panel)
          reject(result)
        })

        request.on('error', (e) => {
          const result = new Result("error", panel, undefined, undefined, e)
          reject(result)
        })

        request.end(() => {
          performance.mark(markerBegin)
        })

      })
    }

    for (let panel of panels) {
      const result = await asyncRequest(panel).catch((reason: Result) => reason)
      yield result
    }
  }


  let totalInserted = 0
  for await (const panelResult of getPanelData(options)) {

    const storage_id = Number(panelResult.storage.storage_id)
    const storage_code = panelResult.storage.storage_code
    const query_time = new Date(Date.now())
    const response_bytes = panelResult?.data || null
    const latency = (panelResult?.latency && Number(panelResult.latency.duration.toFixed(0))) || null

    const json = JSON.stringify({
      ...panelResult.error,
      ...panelResult.latency,
      ...panelResult.storage,
      result: panelResult.result
    })

    const values = [storage_id, storage_code, query_time, response_bytes, latency, json]

    pool.query(insertText, values, (err, result) => {
      totalInserted++
      const pct = (totalInserted / options.length) * 100
      console.log(`inserted ${panelResult.storage.storage_name}, ${pct.toFixed(0)}% complete`)
    })

  }


  performance.mark(markerMainEnd)
  const mainDuration = performance.measure('main start to end', markerMainStart, markerMainEnd).duration / 1000
  console.log(`Completed in: ${mainDuration}s`)
  return
}

main()