const { performance } = require('perf_hooks')

const Heap = require('./heap.js')

/**
 * @template TData
 */
class PathNode {
  /**
   * @type {TData}
   */
  data
  /**
   * @type {number}
   */
  g
  /**
   * @type {number}
   */
  h
  /**
   * @type {number}
   */
  f
  /**
   * @type {PathNode<TData> | null}
   */
  parent

  constructor() {
    // @ts-ignore
    this.data = null
    this.g = 0
    this.h = 0
    this.f = 0
    this.parent = null
  }

  /**
   * @template {TData} TNewData
   * @param {TNewData} data
   * @param {number} g
   * @param {number} h
   * @param {PathNode<TData> | null} parent
   * @returns {PathNode<TNewData>}
   */
  set(data, g, h, parent = null) {
    this.data = data
    this.g = g
    this.h = h
    this.f = g + h
    this.parent = parent
    // @ts-ignore
    return this
  }
}

/**
 * @param {readonly [number, number, number]} a
 * @param {readonly [number, number, number]} b
 * @param {number} t
 * @returns {[number, number, number]}
 */
function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t))
  return [
    a[0] + ((b[0] - a[0]) * t),
    a[1] + ((b[1] - a[1]) * t),
    a[2] + ((b[2] - a[2]) * t),
  ]
}

/**
 * @template TData
 * @param {PathNode<TData>} node
 * @param {import('../../Bruh-MC-Bot/src/debug.js')} debug
 * @returns {Array<TData>}
 */
function reconstructPath(node, debug) {
  /**
   * @type {Array<TData>}
   */
  const path = []
  while (node.parent) {

    // @ts-ignore
    debug.drawPoint(node.data.offset(0.0, 0.5, 0.0), [1, 1, 1])

    path.push(node.data)
    node = node.parent
  }
  return path.reverse()
}

class AStar {
  /**
   * @private @readonly
   */
  startTime
  /**
   * @private @readonly
   */
  movements
  /**
   * @private @readonly
   */
  goal
  /**
   * @private @readonly
   */
  timeout
  /**
   * @private @readonly
   */
  tickTimeout
  /**
   * @private @readonly
   * @type {Set<string>}
   */
  closedDataSet
  /**
   * @private @readonly
   * @type {Heap<PathNode<import('./move.js').Move>>}
   */
  openHeap
  /**
   * @private @readonly
   * @type {Map<string, PathNode<import('./move.js').Move>>}
   */
  openDataMap
  /**
   * @private
   */
  bestNode
  /**
   * @private @readonly
   */
  maxCost
  /**
   * @readonly
   * @type {Set<string>}
   */
  visitedChunks

  /**
   * @param {import('./move').Move} start
   * @param {import('./movements')} movements
   * @param {import('./goals').GoalBase} goal
   * @param {number} timeout
   * @param {number} tickTimeout
   * @param {number} searchRadius
   */
  constructor(start, movements, goal, timeout, tickTimeout, searchRadius) {
    if (searchRadius < 0) { throw new Error(`Argument "searchRadius" must be non-negative`) }
    if (tickTimeout < 0) { throw new Error(`Argument "searchRadius" must be non-negative`) }
    if (timeout < 0) { throw new Error(`Argument "searchRadius" must be non-negative`) }

    this.startTime = performance.now()

    this.movements = movements
    this.goal = goal
    this.timeout = timeout
    this.tickTimeout = tickTimeout

    this.closedDataSet = new Set()
    this.openHeap = new Heap()
    this.openDataMap = new Map()

    const startNode = new PathNode().set(start, 0, goal.heuristic(start))
    this.openHeap.push(startNode)
    this.openDataMap.set(startNode.data.hash, startNode)
    this.bestNode = startNode

    this.maxCost = startNode.h + searchRadius
    this.visitedChunks = new Set()
  }

  /**
   * @private
   * @template {string} TStatus
   * @param {TStatus} status
   * @param {PathNode<import('./move.js').Move>} node
   */
  makeResult(status, node) {
    return {
      status: status,
      cost: node.g,
      time: performance.now() - this.startTime,
      visitedNodes: this.closedDataSet.size,
      generatedNodes: this.closedDataSet.size + this.openHeap.size(),
      path: reconstructPath(node, this.movements.bot.debug),
      context: this
    }
  }

  /**
   * @returns {import('mineflayer-pathfinder').PartiallyComputedPath}
   */
  compute() {
    const computeStartTime = performance.now()
    while (!this.openHeap.isEmpty()) {
      if (performance.now() - computeStartTime > this.tickTimeout) { // compute time per tick
        return this.makeResult('partial', this.bestNode)
      }
      if (performance.now() - this.startTime > this.timeout) { // total compute time
        return this.makeResult('timeout', this.bestNode)
      }
      const node = this.openHeap.pop()
      if (this.goal.isEnd(node.data)) {
        return this.makeResult('success', node)
      }
      // not done yet
      this.openDataMap.delete(node.data.hash)
      this.closedDataSet.add(node.data.hash)
      this.visitedChunks.add(`${node.data.x >> 4},${node.data.z >> 4}`)

      const neighbors = this.movements.getNeighbors(node.data)
      for (const neighborData of neighbors) {
        if (this.closedDataSet.has(neighborData.hash)) {
          continue // skip closed neighbors
        }
        const gFromThisNode = node.g + neighborData.cost
        let neighborNode = this.openDataMap.get(neighborData.hash)
        let update = false

        const heuristic = this.goal.heuristic(neighborData)
        if (gFromThisNode + heuristic > this.maxCost) continue

        if (neighborNode === undefined) {
          // add neighbor to the open set
          neighborNode = new PathNode()
          // properties will be set later
          this.openDataMap.set(neighborData.hash, neighborNode)
        } else {
          if (neighborNode.g < gFromThisNode) {
            // skip this one because another route is faster
            continue
          }
          update = true
        }

        // found a new or better route.
        // update this neighbor with this node as its new parent
        neighborNode.set(neighborData, gFromThisNode, heuristic, node)

        this.movements.bot.debug.drawPoint(neighborNode.data.offset(0.5, 0.5, 0.5), lerpColor([0, 1, 0], [1, 0, 0], neighborNode.h / 10))

        if (neighborNode.h < this.bestNode.h) this.bestNode = neighborNode
        if (update) {
          this.openHeap.update(neighborNode)
        } else {
          this.openHeap.push(neighborNode)
        }
      }
    }
    // all the neighbors of every accessible node have been exhausted
    return this.makeResult('noPath', this.bestNode)
  }
}

module.exports = AStar
