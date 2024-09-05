const pino = require('pino')
const NodeCache = require("node-cache")
const http = require('./utils/http')
const util = require('./utils/index')
const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const { SocksProxyAgent } = require('socks-proxy-agent')

const httpsAgent = new SocksProxyAgent('socks://127.0.0.1:10808')

const roleIdCache = new NodeCache({ stdTTL: 60 * 60 * 24 * 365 })
const cardCache = new NodeCache({ stdTTL: 60 * 60 * 24 })

// const __API = {
//   FETCH_ROLE_ID: 'https://api-takumi-record.mihoyo.com/game_record/app/card/wapi/getGameRecordCard',
//   FETCH_ROLE_INDEX: 'https://api-takumi-record.mihoyo.com/game_record/app/genshin/api/index'
// }

const __API = {
  FETCH_ROLE_ID: 'https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard',
  FETCH_ROLE_INDEX: 'https://bbs-api-os.hoyolab.com/game_record/genshin/api/index'
}


const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Referer': 'https://www.hoyolab.com/',
  'Cookie': "ltoken_v2=v2_CAISDGM5b3FhcTNzM2d1OBokNTczZjVkODYtMTQ3Mi00NjEwLTkxMTctOGE2N2RjNjFlNDU5IInk5rYGKJvTs_gBML3NrssBQgtiYnNfb3ZlcnNlYVhq;ltuid_v2=426485437;",
  'x-rpc-app_version': '1.5.0',
  'x-rpc-client_type': 5, // web
  'DS': ''
}

const MY_UID = process.env.MY_UID
const COOKIE_PRIVATE = process.env.COOKIE_PRIVATE

const getRoleInfo = (uid) => {
  const key = `__uid__${uid}`

  return new Promise((resolve, reject) => {
    let cachedData = roleIdCache.get(key)
    if (cachedData) {
      const { game_role_id, nickname, region, region_name } = cachedData
      logger.info('Get role information from cache, uid %s, game_role_id %s, nickname %s, region %s, region_name %s', uid, game_role_id, nickname, region, region_name)
      resolve(cachedData)
    } else {
      const qs = { uid }

      http({
        method: "GET",
        url: __API.FETCH_ROLE_ID,
        params: qs,
        headers: {
          ...HEADERS,
          'Cookie': uid === MY_UID ? COOKIE_PRIVATE : HEADERS.Cookie,
          'DS': util.getDS(qs)
        },
        httpsAgent: httpsAgent
      })
        .then(resp => {
          // resp = JSON.parse(resp)
          resp = resp.data
          console.log('resp', resp.data)
          if (resp.retcode === 0) {
            if (resp.data.list && resp.data.list.length > 0) {
              const roleInfo = resp.data.list.find(_ => _.game_id === 2)

              if (!roleInfo) {
                logger.warn('No character data, uid %s', uid)
                reject('No character data. Please check whether the entered Hoyolab UID is correct (not the in-game UID) and whether the public character information is set. If the operation is correct, it may be blocked by miHoYo. Please try again the next day.')
              }

              const { game_role_id, nickname, region, region_name } = roleInfo

              logger.info('Get character information for the first time, uid %s, game_role_id %s, nickname %s, region %s, region_name %s', uid, game_role_id, nickname, region, region_name)

              roleIdCache.set(key, roleInfo)

              resolve(roleInfo)
            } else {
              logger.warn('No character data, uid %s', uid)
              reject('No character data. Please check whether the entered Hoyolab UID is correct (not the in-game UID) and whether the public character information is set. If the operation is correct, it may be blocked by miHoYo. Please try again the next day.')
            }
          } else {
            logger.error('Get role ID API error %s', resp.message)
            reject(resp.message)
          }
        })
        .catch(err => {
          logger.error('Get role ID API error  %o', err)
        })
    }
  })
}

const userInfo = ({ uid, detail = false }) => {
  const key = `__uid__${uid}_${detail ? 'detail' : 'lite'}`

  return new Promise((resolve, reject) => {
    let cachedBody = cardCache.get(key)
    if (cachedBody) {
      if (cachedBody.retcode === 10101) {
        reject(cachedBody.message)
      } else {
        resolve(cachedBody)
      }
      return
    } else {

      getRoleInfo(uid)
        .then(roleInfo => {
          console.log('roleInfo', roleInfo)
          const { game_role_id, region } = roleInfo

          const qs = { role_id: game_role_id, server: region }

          if (detail) {
            http({
              method: "GET",
              url: __API.FETCH_ROLE_INDEX,
              qs,
              headers: {
                ...HEADERS,
                'Cookie': uid === MY_UID ? COOKIE_PRIVATE : HEADERS.Cookie,
                'DS': util.getDS(qs)
              }
            })
              .then(resp => {
                resp = JSON.parse(resp)
                if (resp.retcode === 0) {
                  const { world_explorations } = resp.data
                  const percentage = Math.min((world_explorations.reduce((total, next) => total + next.exploration_percentage, 0) / world_explorations.length / 10000 * 1000).toFixed(1), 100)
                  const world_exploration = percentage

                  const data = {
                    uid: game_role_id,
                    world_exploration,
                    ...resp.data.stats,
                    ...roleInfo
                  }

                  cardCache.set(key, data)
                  resolve(data)

                } else {
                  cardCache.set(key, resp)
                  logger.error('获取角色详情接口报错 %s', resp.message)
                  reject(resp.message)
                }
              })
              .catch(err => {
                logger.warn(err)
                reject(err)
              })
          } else {

            const [active_day_number, character_number, achievement_number, spiral_abyss] = roleInfo.data

            const parsed = {
              active_day_number: active_day_number.value,
              character_number: character_number.value,
              achievement_number: achievement_number.value,
              spiral_abyss: spiral_abyss.value,
            }

            const data = {
              uid: game_role_id,
              ...parsed,
              ...roleInfo
            }

            cardCache.set(key, data)
            resolve(data)
          }
        })
        .catch(err => {
          logger.warn(err)
          reject(err)
        })

    }
  })
}

module.exports = userInfo