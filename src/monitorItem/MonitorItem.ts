import { RequestOptions } from 'http'
import { ConnectionResult } from '../index'

interface RequestError extends Error {
  code: any
}

interface Connection {
  requestOptions: RequestOptions
  requestResult?: ConnectionResult
}

interface JobInformation {
  authAttempts: number,
  usingDefaultLogin: boolean,
  unknownLogin: boolean,
  completedSuccessfully: boolean
}

const DEFAULT_LOGINS = [
  { username: 'agri', password: '7008' },
  { username: 'agri', password: 'stor' },
  { username: 'btu', password: '7564' },
  { username: 'frontdoor', password: 'backdoor' },
  { username: 'backdoor', password: 'frontdoor' }
]

class MonitorItem {

  public readonly panel: Panel
  public connections: Connection[] = []
  public data?: Buffer
  public info: JobInformation = {
      authAttempts: 0,
      usingDefaultLogin: false,
      unknownLogin: false,
      completedSuccessfully: false
    }

  constructor(panel: iMonitorListItem) {

    let logins: { username: string, password: string }[] = []

    panel.logins.forEach((login: string) => {

      const match = /^(\w+?)[\/]+(\w+)$/.exec(login)

      if (match) {
        const [_, username, password] = match
        logins.push({ username, password })
      }
    })

    logins = logins.concat(DEFAULT_LOGINS)

    this.panel =  { ...panel, logins }

    const [hostname, port] = this.panel.url.split(':')

    this.connections = this.panel.logins.map(({username, password}) => ({
      requestOptions: {
        family: 4,
        method: 'GET',
        hostname,
        port,
        auth: `${username}:${password}`,
        path: 'fulldata.dat?a=100&b=100&c=0&d=100&e=0&f=en',
        timeout: 11000
      }
    }))

    if (this.connections.length === DEFAULT_LOGINS.length) {
      this.info.usingDefaultLogin = true
    }
  }

  getCurrentConnectionOptions(): Connection | undefined {
    return this.connections[this.info.authAttempts]
  }

  handleAuthError(result: ConnectionResult) {

    this._setConnectionResult(result)

    this.info.authAttempts++

    if (this.info.authAttempts >= this.connections.length - 1) {
      this.info.unknownLogin = true
    }

  }

  _handleSuccessResult(result: ConnectionResult) {
    const connection = this.getCurrentConnectionOptions() as Connection
    connection.requestResult = result
    this.data = connection.requestResult.data
    this._getLoginsFromResponseBytes()
  }

  _setConnectionResult(result: ConnectionResult) {
    const connection = this.getCurrentConnectionOptions() as Connection
    connection.requestResult = result
  }

  handleResult(result: ConnectionResult) {
    
    if (result.result === 'autherror') {
      this.handleAuthError(result)
    }

    if (result.result === 'success') {
      this._handleSuccessResult(result)
    }
  }

  _getLoginsAgain() {
    function decodeLogins(hexStr: string): void {
      const logins: Record<string, any> = {
        numLogins: 0,
        first: '',
        second: '',
        third: ''
      }
    
      let foundDataStart = false
      let buffArr: Buffer[] = []
    
      for (let i = 0; i < hexStr.length; i += 2) {
    
        const byte = hexStr[i] + hexStr[i + 1]
    
        if (foundDataStart) {
    
          //at the end of a login string, 0x3 in ASCII is ETX (end-of-text
          if (byte === '03') {
            console.log(`Login end index: ${(i-2)/2}`)
    
            const fullBuffer = Buffer.from(Buffer.concat(buffArr).toString('ascii'), 'base64')
            
            for (let key of Object.keys(logins)) {
              if (logins[key] === '') {1
                logins[key] = fullBuffer.toString('utf-8')
                logins.numLogins += 1
                break
              }
            }
            
            buffArr = []
          }
    
          if (byte !== '03') {
    
            if (buffArr.length === 0) {
              console.log(`Login start index: ${i/2}`)
            }
    
            buffArr.push(Buffer.from(byte, 'hex'))
            continue
          }
        }
    
        if (byte === '0c' && i > 2050) {
          foundDataStart = true
          console.log(`Found login data start at index: ${i/2}`)
        }
      }
    }
  }

  _getLoginsFromResponseBytes() {
    const self = this
    console.log(this.panel.storage_name)
    function decodeLogins(hexStr: string): void {
      const logins: Record<string, any> = {
        numLogins: 0,
        first: '',
        second: '',
        third: ''
      }
    
      let foundDataStart = false
      let buffArr: Buffer[] = []
      let startIndex: number
      let endIndex: number
      let tries = 0
    
      for (let i = 0; i < hexStr.length; i += 2) {
    
        const foundAllLogins = tries === 3
        
        if (foundAllLogins || i > 2900) {
          console.log(logins)
          return
        }
    
        const byte = hexStr[i] + hexStr[i + 1]
    
        if (foundDataStart) {
    
          //at the end of a login string, 0x3 in ASCII is ETX (end-of-text
          if (byte === '03') {


            // console.log(`Login end index: ${(i-2)/2}`)
            endIndex = (i - 2) / 2
            const size = endIndex - (startIndex! as number)

            if (size > 18) {
              tries++
              // console.log('too big:' + size)
              buffArr = []
            } else if (size < 4) {
              tries++
              // console.log('too small:', size)
              buffArr = []
            } else {
      
              const fullBuffer = Buffer.from(Buffer.concat(buffArr).toString('ascii'), 'base64')
              const login = fullBuffer.toString('utf-8')

              if (login === ':' || login.indexOf(':') === -1) {
                tries++
                buffArr = []
              } else {
                for (let key of Object.keys(logins)) {
                  if (logins[key] === '') {
                    logins[key] = login
                    logins.numLogins += 1
                    break
                  }
                }
                buffArr = []
              }
            }
          }
    
          if (byte !== '03') {
    
            // start of the login
            if (buffArr.length === 0) {
              // console.log(`Login start index: ${i/2}`)
              startIndex = i / 2
            }
    
            buffArr.push(Buffer.from(byte, 'hex'))
            continue
          }
        }
    
        if (byte === '0c' && i > 1800) {
          foundDataStart = true
          // console.log(`Found login data start at index: ${i/2}`)
        }
      }
    }
    decodeLogins(this.data!.toString('hex') as string)
  }


}

export default MonitorItem