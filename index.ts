import {
  getTotalSupply,
  getTransactionReceipt,
  subscribeToPendings,
  subscribeToReceipts
} from './eth'

export async function getTransactionReceiptTest() {
  console.log(
    await getTransactionReceipt(
      '0x941621d7395211765b73dabf15997ac91b7e36e8875a75367041d6f46e561d93'
    )
  )
}

export async function getTotalSupplyTest() {
  console.log(await getTotalSupply('0x3102315878d16c5be7ee9da1254fc204234aeed6'))
}

export async function testSubscribeToReceipts() {
  subscribeToReceipts(x => console.log('got receipt', x))
}

export async function testSubscribeToPendings() {
  subscribeToPendings(x => console.log('got pending tx', x))
}
