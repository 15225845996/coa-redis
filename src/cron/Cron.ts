import { echo } from 'coa-echo'
import { env } from 'coa-env'
import { _ } from 'coa-helper'
import { RedisQueueWorker } from '../'
import { RedisBin } from '../RedisBin'
import { Dic, Redis } from '../typings'
import { CronTime } from './CronTime'

const D = { series: 0 }

export class RedisCron {

  private readonly times: Dic<string>
  private readonly workers: Dic<() => Promise<void>>
  private readonly push: (id: string, data: object) => Promise<number>

  private readonly prefix: string
  private readonly key_cron_last: string

  private readonly io: Redis.Redis

  constructor (bin: RedisBin, worker: RedisQueueWorker) {
    this.times = {}
    this.workers = {}
    this.push = worker.on('CRON', id => this.work(id))
    this.prefix = bin.config.prefix + '-aac-cron-'
    this.key_cron_last = this.prefix + 'last'
    this.io = bin.io
  }

  // 添加日程计划
  on (time: string, worker: () => Promise<void>) {
    const id = `${env.version}-${++D.series}`
    this.times[id] = time
    this.workers[id] = worker
  }

  // 尝试触发
  async try () {
    const deadline = _.now()
    const start = _.toInteger(await this.io.getset(this.key_cron_last, deadline)) || (deadline - 1000)
    _.forEach(this.times, (time, id) => {
      const next = new CronTime(time, { start, deadline }).next()
      if (next) this.push(id, {})
    })
  }

  // 开始执行
  private async work (id: string) {
    const worker = this.workers[id]
    if (worker) {
      try {
        await worker()
      } catch (e) {
        echo.error('* Cron JobError: %s %s', id, this.times[id], e.toString())
      }
    } else {
      echo.error('* Cron JobNotFound: %s %s', id, this.times[id])
    }
  }
}
