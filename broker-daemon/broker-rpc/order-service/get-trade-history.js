/**
 * Retrieve information about completed trades
 *
 * @param {GrpcUnaryMethod~request} request - request object
 * @param {object} request.logger
 * @param {BlockOrderWorker} request.blockOrderWorker
 * @param {object} responses
 * @param {Function} responses.GetTradeHistoryResponse - constructor for GetTradeHistoryResponse messages
 * @returns {responses.GetTradeHistoryResponse}
 */

async function getTradeHistory ({ logger, blockOrderWorker }, { GetTradeHistoryResponse }) {
  try {
    const { orders, fills } = await blockOrderWorker.getTrades()

    return new GetTradeHistoryResponse({
      orders,
      fills
    })
  } catch (err) {
    logger.error('Received error when grabbing trades', { error: err.stack })
    throw new Error(err.message)
  }
}

module.exports = getTradeHistory
