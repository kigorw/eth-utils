throw Error('Insert your api keys')

export const ethKeys = {
  alchemy: '',
  infura: '',
  infura2: '',
  pocket: '',
  anyblock: ''
}

export const quicknodeMainnet = ''
export const quicknodeMainnetWs = ''

// see https://ethereumnodes.com/
export const ethEndpoints = {
  infura: {
    transactionOnly: true,
    mainnet: 'https://mainnet.infura.io/v3/' + ethKeys.infura,
    mainnetWs: 'wss://mainnet.infura.io/ws/v3/' + ethKeys.infura
  },
  infura2: {
    transactionOnly: true,
    mainnet: 'https://mainnet.infura.io/v3/' + ethKeys.infura2,
    mainnetWs: 'wss://mainnet.infura.io/ws/v3/' + ethKeys.infura2
  },
  taichUS: {
    transactionOnly: true,
    mainnet: 'https://api-us.taichi.network:10001/rpc/public'
  },
  cloudflare: {
    mainnet: 'https://cloudflare-eth.com/'
  },
  inch: {
    mainnet: 'https://web3.1inch.exchange/'
  },
  blockscout: {
    mainnet: 'https://mainnet-nethermind.blockscout.com/'
  },
  avado: {
    mainnet: 'https://mainnet.eth.cloud.ava.do/'
  },
  pocket: {
    // slow
    mainnet: 'https://eth-mainnet.gateway.pokt.network/v1/' + ethKeys.pocket
  },
  anyblock: {
    mainnet: 'https://api.anyblock.tools/ethereum/ethereum/mainnet/rpc/' + ethKeys.anyblock,
    ropsten: 'https://api.anyblock.tools/ethereum/ethereum/ropsten/rpc/' + ethKeys.anyblock
  },
  alchemy: {
    mainnet: 'https://eth-mainnet.alchemyapi.io/v2/' + ethKeys.alchemy,
    mainnetWS: 'wss://eth-mainnet.ws.alchemyapi.io/v2/' + ethKeys.alchemy
  },
  quicknode: {
    mainnet: quicknodeMainnet,
    mainnetWs: quicknodeMainnetWs
  }
}

export const websocketEndpoints = Object.keys(ethEndpoints)
  .filter(name => ethEndpoints[name].mainnetWs)
  .map(name => ({
    name,
    url: ethEndpoints[name].mainnetWs
  }))

export const genericEndpoints = Object.keys(ethEndpoints)
  .filter(name => !ethEndpoints[name].transactionOnly)
  .map(name => ({
    name,
    url: ethEndpoints[name].mainnet
  }))

// makes sense to separate couple of endpoints that are sending transactions
// you don't want to be rate limited on them
export const transactionOnlyEndpoints = Object.keys(ethEndpoints)
  .filter(name => ethEndpoints[name].transactionOnly)
  .map(name => ({
    name,
    url: ethEndpoints[name].mainnet
  }))
