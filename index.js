const express = require("express")
const compression = require('compression')
const pino = require('pino')
const svg = require('./utils/svg')
const userInfo = require('./userInfo')
const app = express()
const path = require('path')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })

app.use(express.static(path.join(__dirname, 'public')))
app.use(compression())
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')

app.get("/", (req, res) => res.render('index.pug'))
const CACHE_0 = 'max-age=0, no-cache, no-store, must-revalidate'
const CACHE_10800 = 'max-age=10800'




app.get('/:skin/:uid\.png', (req, res) => {
  const { skin, uid } = req.params
  logger.info('收到请求 uid:%s, skin:%s', uid, skin)

  userInfo({ uid })
    .then(data => {
      svg({ data, skin })
        .then(svgImage => {
          res.set({
            'content-type': 'image/svg+xml',
            'cache-control': isNaN(skin) ? CACHE_0 : CACHE_10800
          })

          res.send(svgImage)
        })
    })
    .catch(err => {
      res.json({
        msg: err,
        code: -1
      })
    })

})

app.get('/detail/:skin/:uid\.png', (req, res) => {
  const { skin, uid } = req.params
  logger.info('收到请求 uid:%s, skin:%s', uid, skin)

  const detail = true

  userInfo({ uid, detail })
    .then(data => {
      svg({ data, skin, detail })
        .then(svgImage => {
          res.set({
            'content-type': 'image/svg+xml',
            'cache-control': isNaN(skin) ? CACHE_0 : CACHE_10800
          })

          res.send(svgImage)
        })
    })
    .catch(err => {
      res.json({
        msg: err,
        code: -1
      })
    })

})

app.get('/heart-beat', (req, res) => {
  res.set({
    'cache-control': 'max-age=0, no-cache, no-store, must-revalidate'
  })

  res.json({
    msg: 'alive',
    code: 0
  })

  logger.info('heart-beat')
})


// app.listen(3000, () => logger.info('Your app is listening on port ' + 3000))

module.exports = app