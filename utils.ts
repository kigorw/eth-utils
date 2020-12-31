import sortBy from 'lodash/sortBy'

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value !== null && value !== undefined
}

export function pmap<MapType, ResultType>(
  iterable: Iterable<MapType>,
  mapper: (x: MapType, index: number) => Promise<ResultType>,
  options: { concurrency: number }
) {
  return new Promise<ResultType[]>((resolve, reject) => {
    options = Object.assign(
      {
        concurrency: Infinity
      },
      options
    )

    if (typeof mapper !== 'function') {
      throw new TypeError('Mapper function is required')
    }

    const { concurrency } = options

    if (!(typeof concurrency === 'number' && concurrency >= 1)) {
      throw new TypeError(
        // tslint:disable-next-line:max-line-length
        `Expected \`concurrency\` to be a number from 1 and up, got \`${concurrency}\` (${typeof concurrency})`
      )
    }

    const ret: ResultType[] = []
    const iterator = iterable[Symbol.iterator]()
    let isRejected = false
    let isIterableDone = false
    let resolvingCount = 0
    let currentIndex = 0

    const next = () => {
      if (isRejected) {
        return
      }

      const nextItem = iterator.next()
      const i = currentIndex
      currentIndex++

      if (nextItem.done) {
        isIterableDone = true

        if (resolvingCount === 0) {
          resolve(ret)
        }

        return
      }

      resolvingCount++

      Promise.resolve(nextItem.value)
        .then(element => mapper(element, i))
        .then(
          value => {
            ret[i] = value
            resolvingCount--
            next()
          },
          error => {
            isRejected = true
            reject(error)
          }
        )
    }

    for (let i = 0; i < concurrency; i++) {
      next()

      if (isIterableDone) {
        break
      }
    }
  })
}

export function retry<T>(
  f: () => Promise<T>,
  {
    times,
    delay,
    onRetry
  }: { times: number; delay: number; onRetry?(e: Error, times: number): void }
): Promise<T> {
  const res = f()
  if (times > 0) {
    return res.catch(e => {
      if (onRetry) onRetry(e, times)
      return new Promise((resolve, _) => setTimeout(resolve, delay)).then(_ =>
        retry(f, { times: times - 1, delay })
      )
    })
  } else {
    return res
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, lbl: string): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error(`${lbl}: timed out after ${ms} ms.`)), ms)
  )

  return Promise.race([promise, timeout])
}

export class LimitedArray {
  constructor(
    public maxSize = 500,
    { isReportLatency = false, label }: { isReportLatency: boolean; label?: string }
  ) {
    if (isReportLatency) {
      setInterval(() => {
        const sources = Object.keys(this.avgLagPerSource)
        const report = sortBy(
          sources.map(name => ({
            name,
            place: this.avgPlace[name],
            avgLag: this.avgLagPerSource[name]
          })),
          'place'
        )
          .map(x => `${x.name}: ${x.place} (${x.avgLag})`)
          .join(', ')
        console.log(`websocket latency ${label}, ${report}`)
      }, 60 * 1000)
    }
  }
  avgLagPerSource: Record<string, number> = {}
  avgPlace: Record<string, number> = {}

  xs: { value: string; source: string; time: number; counter: number }[] = []
  add(value: string, source: string) {
    this.xs.push({ value, source, time: Date.now(), counter: 1 })
    this.avgPlace[source] = ((this.avgPlace[source] || 1) + 1) / 2

    if (this.xs.length >= this.maxSize) {
      this.xs.shift()
    }
  }

  has(value: string, source: string) {
    const result = this.xs.find(x => x.value === value)

    if (result) {
      result.counter++
      if (!this.avgLagPerSource[source]) {
        this.avgLagPerSource[source] = Date.now() - result.time
      } else {
        this.avgLagPerSource[source] =
          (this.avgLagPerSource[source] + (Date.now() - result.time)) / 2
      }
      if (this.avgPlace[source]) {
        this.avgPlace[source] = ((this.avgPlace[source] || 1) + result.counter) / 2
      } else {
        this.avgPlace[source] = result.counter
      }
    }

    return result
  }
}
