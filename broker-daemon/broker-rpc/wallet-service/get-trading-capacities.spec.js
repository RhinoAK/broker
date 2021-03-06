const path = require('path')
const { expect, rewire, sinon } = require('test/test-helper')

const getTradingCapacities = rewire(path.resolve(__dirname, 'get-trading-capacities'))

describe('get-trading-capacities', () => {
  describe('getTradingCapacities', () => {
    let logger
    let baseEngineStub
    let counterEngineStub
    let engines
    let getCapacitiesStub
    let params
    let orderbooks
    let blockOrderWorker
    let committedBaseSendCapacity
    let committedBaseReceiveCapacity
    let committedCounterSendCapacity
    let committedCounterReceiveCapacity

    let revert

    beforeEach(() => {
      logger = {
        info: sinon.stub(),
        debug: sinon.stub()
      }
      params = { market: 'BTC/LTC' }
      orderbooks = new Map([['BTC/LTC', { store: sinon.stub() }]])
      baseEngineStub = sinon.stub()
      counterEngineStub = sinon.stub()
      engines = new Map([['BTC', baseEngineStub], ['LTC', counterEngineStub]])
      getCapacitiesStub = sinon.stub().resolves({})
      blockOrderWorker = {
        calculateActiveFunds: sinon.stub()
      }
      committedBaseSendCapacity = '0.00001'
      committedBaseReceiveCapacity = '0.00002'
      committedCounterSendCapacity = '0.00003'
      committedCounterReceiveCapacity = '0.00004'
      blockOrderWorker.calculateActiveFunds.withArgs(params.market, {
        inboundSymbol: 'BTC',
        outboundSymbol: 'LTC'
      }).resolves({
        inbound: committedBaseReceiveCapacity,
        outbound: committedCounterSendCapacity
      })
      blockOrderWorker.calculateActiveFunds.withArgs(params.market, {
        inboundSymbol: 'LTC',
        outboundSymbol: 'BTC'
      }).resolves({
        inbound: committedCounterReceiveCapacity,
        outbound: committedBaseSendCapacity
      })

      revert = getTradingCapacities.__set__('getCapacities', getCapacitiesStub)
    })

    afterEach(() => {
      revert()
    })

    it('throws an error if the market does not exist in the orderbook', () => {
      orderbooks = new Map([['ABC/DXS', { store: sinon.stub() }]])

      const errorMessage = `${params.market} is not being tracked as a market.`
      return expect(getTradingCapacities({ params, logger, engines, orderbooks, blockOrderWorker })).to.eventually.be.rejectedWith(errorMessage)
    })

    it('throws an error if the base engine does not exist for symbol', () => {
      engines = new Map([['LTC', counterEngineStub]])
      return expect(
        getTradingCapacities({ params, logger, engines, orderbooks, blockOrderWorker })
      ).to.eventually.be.rejectedWith(`No engine available for BTC`)
    })

    it('throws an error if the counter engine does not exist for symbol', () => {
      engines = new Map([['BTC', baseEngineStub]])
      return expect(
        getTradingCapacities({ params, logger, engines, orderbooks, blockOrderWorker })
      ).to.be.rejectedWith(`No engine available for LTC`)
    })

    it('gets the outstanding funds', async () => {
      await getTradingCapacities({ params, logger, engines, orderbooks, blockOrderWorker })

      expect(blockOrderWorker.calculateActiveFunds).to.have.been.calledTwice()
      expect(blockOrderWorker.calculateActiveFunds).to.have.been.calledWith(params.market, {
        inboundSymbol: 'BTC',
        outboundSymbol: 'LTC'
      })
      expect(blockOrderWorker.calculateActiveFunds).to.have.been.calledWith(params.market, {
        inboundSymbol: 'LTC',
        outboundSymbol: 'BTC'
      })
    })

    it('gets the balances from a particular engine', async () => {
      await getTradingCapacities({ params, logger, engines, orderbooks, blockOrderWorker })

      expect(getCapacitiesStub).to.have.been.calledTwice()
      expect(getCapacitiesStub).to.have.been.calledWith(baseEngineStub, 'BTC', committedBaseSendCapacity, committedBaseReceiveCapacity)
      expect(getCapacitiesStub).to.have.been.calledWith(counterEngineStub, 'LTC', committedCounterSendCapacity, committedCounterReceiveCapacity)
    })

    it('returns all channel balances for the broker daemon', async () => {
      const result = await getTradingCapacities({ params, logger, engines, orderbooks, blockOrderWorker })

      expect(result).to.be.eql({ baseSymbolCapacities: {}, counterSymbolCapacities: {} })
    })
  })
})

describe('getCapacities', () => {
  const outstandingSendCapacity = '100'
  const outstandingReceiveCapacity = '200'

  let engineStub
  let symbol
  let getCapacities
  let openChannelCapacities
  let pendingChannelCapacities
  let logger

  beforeEach(() => {
    symbol = 'BTC'
    openChannelCapacities = { active: { localBalance: 500, remoteBalance: 1000 }, inactive: { localBalance: 200, remoteBalance: 2000 } }
    pendingChannelCapacities = { localBalance: 500, remoteBalance: 1000 }
    engineStub = {
      getOpenChannelCapacities: sinon.stub().resolves(openChannelCapacities),
      getPendingChannelCapacities: sinon.stub().resolves(pendingChannelCapacities),
      quantumsPerCommon: '100000000'
    }

    logger = {
      debug: sinon.stub()
    }

    getCapacities = getTradingCapacities.__get__('getCapacities')
  })

  it('gets the total balance of an engine', async () => {
    await getCapacities(engineStub, 'BTC', outstandingSendCapacity, outstandingReceiveCapacity, { logger })
    expect(engineStub.getOpenChannelCapacities).to.have.been.calledOnce()
  })

  it('gets the total channel balance of an engine', async () => {
    await getCapacities(engineStub, 'BTC', outstandingSendCapacity, outstandingReceiveCapacity, { logger })
    expect(engineStub.getPendingChannelCapacities).to.have.been.calledOnce()
  })

  it('returns balances for an engine', async () => {
    const { OK } = getTradingCapacities.__get__('CAPACITY_STATE')
    const res = await getCapacities(engineStub, 'BTC', outstandingSendCapacity, outstandingReceiveCapacity, { logger })
    expect(res).to.eql({
      symbol,
      status: OK,
      availableReceiveCapacity: '0.000008',
      availableSendCapacity: '0.000004',
      inactiveReceiveCapacity: '0.00002',
      inactiveSendCapacity: '0.000002',
      pendingReceiveCapacity: '0.00001',
      pendingSendCapacity: '0.000005',
      outstandingReceiveCapacity: '0.000002',
      outstandingSendCapacity: '0.000001'
    })
  })

  it('returns empty values if we fail to get channel capacities', async () => {
    const { FAILED } = getTradingCapacities.__get__('CAPACITY_STATE')
    engineStub.getOpenChannelCapacities.rejects(new Error('Something Failed'))
    const res = await getCapacities(engineStub, 'BTC', outstandingSendCapacity, outstandingReceiveCapacity, { logger })
    expect(res).to.eql({
      symbol,
      status: FAILED,
      error: 'Something Failed'
    })
  })
})
