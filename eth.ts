import { Log } from 'web3-core'
import { BigNumber } from 'bignumber.js'

import shuffle from 'lodash/shuffle'

import Web3 from 'web3'
import { TransactionReceipt, Transaction } from 'web3-core'
import { Eth } from 'web3-eth'
import { Contract } from 'web3-eth-contract'
import { AbiItem } from 'web3-utils'
import { genericEndpoints, transactionOnlyEndpoints, websocketEndpoints } from './config'
import { erc20Abi } from './erc20Abi'
import { LimitedArray, nonNullable, withTimeout } from './utils'

const ContractConstructor = require('web3-eth-contract')

// after client reaches this number stop using it
const MAX_CLIENT_ERRORS = 50
// retry disabled client after long time, maybe it works again
const RETRY_CLIENT_TIME = 60 * 1000 * 60 * 2 // 2 hours

// if call takes longer, we will try with other provider
const OPERATION_TIMEOUT = 2100

export function toWei(value: string | number, decimals: number) {
  return new BigNumber(String(value)).times(new BigNumber(Math.pow(10, decimals))).toString(10)
}
export function fromWei(wei: string, decimals: number) {
  return new BigNumber(String(wei)).div(new BigNumber(Math.pow(10, decimals)))
}

export interface EthClient {
  client: Eth
  errors: number
  name: string
  latency: number
}

function createClients(endpoints: { name: string; url: string }[]) {
  return endpoints.map(x => ({
    client: new Web3.modules.Eth(new Web3.providers.HttpProvider(x.url), null as any),
    name: x.name,
    url: x.url,
    errors: 0,
    latency: 0
  }))
}

const transactionClients = createClients(transactionOnlyEndpoints)
const genericClients = createClients(genericEndpoints)

export function getGenericClients(): EthClient[] {
  return shuffle(genericClients.filter(x => x.errors < MAX_CLIENT_ERRORS))
}

export function getTransactionClients(): EthClient[] {
  return shuffle(transactionClients.filter(x => x.errors < MAX_CLIENT_ERRORS))
}

// solves memory leak when creating many contracts https://github.com/ethereum/web3.js/issues/3042
export function makeContract(client: Eth, jsonInterface: AbiItem[], address?: string | undefined) {
  const contract: Contract = new ContractConstructor(jsonInterface, address)
  ;(contract as any).setProvider(client.currentProvider)
  return contract
}

export async function clientOperation<T>(
  {
    label,
    isGenericClient = true,
    isBenchmark = false,
    isCountFailures = false,
    retryLimit = 5,
    clientFilter = []
  }: {
    label: string
    isGenericClient?: boolean
    isBenchmark?: boolean
    isCountFailures?: boolean
    retryLimit?: number
    clientFilter?: string[]
  },
  cb: (client: Eth) => Promise<T>
): Promise<T | undefined> {
  const clients = isGenericClient
    ? getGenericClients()
    : getTransactionClients()
        .filter(nonNullable)
        .filter(x => (clientFilter.length === 0 ? true : clientFilter.includes(x.name)))

  const count = Math.min(retryLimit, clients.length)

  for (let i = 0; i < count; i++) {
    const client = clients[i]
    try {
      const start = Date.now()
      const result = await withTimeout(
        cb(client.client),
        OPERATION_TIMEOUT,
        `${label}: client.name`
      )

      const time = Date.now() - start

      if (isBenchmark) {
        if (!client.latency) {
          client.latency = time
        } else {
          client.latency = (client.latency + time) / 2
        }
      }
      return result
    } catch (e) {
      // skip those messages
      if (e.message.includes('timed out')) {
        continue
      }

      if (isCountFailures) {
        client.errors++
        console.warn(
          `client operation error ${label} ${client.name}: ${client.errors}, ${e.message}`
        )
      }

      if (client.errors === MAX_CLIENT_ERRORS) {
        console.log(
          `disabling client ${client.name} errors: ${client.errors} latency ${client.latency}`
        )
        setTimeout(() => {
          client.errors = 0
          // in 2 hours try again
        }, RETRY_CLIENT_TIME)
      }

      if (i === count - 1) {
        console.log(`${label}: all ${count} returned error ${label} ${e.message}`)
      }
    }
  }
}

export async function getTransaction(txId: string) {
  return clientOperation({ label: `getTransaction:  ${txId}` }, client =>
    client.getTransaction(txId)
  )
}

export async function getTransactionReceipt(txId: string) {
  return clientOperation(
    { label: `getTransactionReceipt:  ${txId}`, isBenchmark: true, isCountFailures: true },
    client => client.getTransactionReceipt(txId)
  )
}

export async function getDecimals(address: string) {
  return clientOperation<number>({ label: 'decimals' }, client =>
    makeContract(client, erc20Abi, address).methods.decimals().call()
  )
}

export async function getTotalSupply(address: string, decimals?: number) {
  if (!decimals) {
    decimals = await getDecimals(address)
  }
  if (!decimals) throw Error(`Can't get total supply of ${address}, decimals is undefined`)

  return clientOperation({ label: 'totalSupply' }, async client => {
    const totalSupply: string = await makeContract(client, erc20Abi, address)
      .methods.totalSupply()
      .call()
    return fromWei(totalSupply, decimals!)
  })
}

export function getSocketClient(url: string) {
  return new Web3.modules.Eth(new Web3.providers.WebsocketProvider(url), null as any)
}

export async function subscribeToReceipts(cb: (receipt: TransactionReceipt) => void) {
  const duplicateRemover = new LimitedArray(500, { isReportLatency: true, label: 'transactions' })

  const subscribe = (client: Eth, clientName: string) => {
    console.log(`subscribing to logs with ${clientName}`)
    client.subscribe('logs', {}, (err, x: Log) => txHandler(err, x, clientName))
  }

  async function txHandler(error: Error, _log: Log, clientName: string) {
    if (error) {
      console.log('txHandler error ' + error)
      return
    }
    if (!_log) return

    if (duplicateRemover.has(_log.transactionHash, clientName)) return
    duplicateRemover.add(_log.transactionHash, clientName)
    const receipt = await getTransactionReceipt(_log.transactionHash)
    if (!receipt) return
    cb(receipt)
  }

  websocketEndpoints.forEach(x => subscribe(getSocketClient(x.url), x.name))
}

export async function subscribeToPendings(cb: (receipt: Transaction) => void) {
  const duplicateRemover = new LimitedArray(500, { isReportLatency: true, label: 'pendings' })

  const subscribe = (client: Eth, clientName: string) => {
    console.log(`subscribing to pending transactions ${clientName}`)
    client.subscribe('pendingTransactions', (error, hash: string) =>
      txHandler(error, hash, clientName)
    )
  }

  async function txHandler(error: Error, hash: string, clientName: string) {
    if (error) {
      console.log('txHandler error ' + error)
      return
    }
    if (!hash) return

    if (duplicateRemover.has(hash, clientName)) return
    duplicateRemover.add(hash, clientName)

    const tx = await getTransaction(hash)
    if (!tx) return
    cb(tx)
  }

  websocketEndpoints.forEach(x => subscribe(getSocketClient(x.url), x.name))
}
