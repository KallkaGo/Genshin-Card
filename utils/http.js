const axios = require('axios')

function http(options) {
 return axios.request(options)
}
module.exports = http