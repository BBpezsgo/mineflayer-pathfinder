/// <reference types="./module.d.ts" />

const { performance } = require('perf_hooks')

const AStar = require('./lib/astar')
const Move = require('./lib/move')
const Movements = require('./lib/movements')
const gotoUtil = require('./lib/goto')
const Lock = require('./lib/lock')
const goals = require('./lib/goals')

const Vec3 = require('vec3').Vec3

const Physics = require('./lib/physics')
const nbt = require('prismarine-nbt')
// @ts-ignore
const interactableBlocks = require('./lib/interactable.json')
const { Block } = require('prismarine-block')
const { Item } = require('prismarine-item')

/**
 * @typedef {{
 *   cost: number;
 *   time: number;
 *   visitedNodes: number;
 *   generatedNodes: number;
 *   path: Array<Move>;
 * }} PathBase
 */

/**
 * @typedef {'goal_updated' |
 * 'movements_updated' |
 * 'block_updated' |
 * 'chunk_loaded' |
 * 'goal_moved' |
 * 'dig_error' |
 * 'no_scaffolding_blocks' |
 * 'place_error' |
 * 'stuck'
 * } GoalUpdateReason
 */

/**
 * @typedef {PathBase & {
 *  status: 'noPath' | 'timeout' | 'success';
 * }} ComputedPath
 */

/**
 * @typedef {PathBase & {
 *  status: 'noPath' | 'timeout' | 'success' | 'partial';
 * }} PartiallyComputedPath
 */

/**
 * @typedef {{
 *   stateId: number;
 *   name: string;
 *   id: number;
 *   position: Vec3;
 *   safe: boolean;
 *   physical: boolean;
 *   liquid: boolean;
 *   height: number;
 *   replaceable: boolean;
 *   climbable: boolean;
 *   openable: boolean;
 *   canFall: boolean;
 *   canWalkOn: boolean;
 *   canJumpFrom: boolean;
 * }} SafeBlock
 */

/**
 * @typedef {{
 *  readonly error: number;
 *	thinkTimeout: number;
 *	tickTimeout: number;
 *	readonly goal: import('./lib/goals').GoalBase | null;
 *	readonly movements: Movements;
 *  readonly path: ReadonlyArray<Move>
 *	searchRadius: number;
 *	enablePathShortcut: boolean;
 *	LOSWhenPlacingBlocks: boolean;
 *  lookAtTarget: boolean;
 *	bestHarvestTool(block: Block): Item | null;
 *	getPathTo(
 *		movements: Movements,
 *		goal: import('./lib/goals').GoalBase,
 *		timeout?: number
 *	): PartiallyComputedPath;
 *	getPathFromTo(
 *		movements: Movements,
 *		startPos: Vec3, 
 *		goal: import('./lib/goals').GoalBase, 
 *		options?: {
 *			optimizePath?: boolean,
 *			resetEntityIntersects?: boolean,
 *			timeout?: number,
 *			tickTimeout?: number,
 *			searchRadius?: number,
 *			startMove?: Move
 *		}
 *	): IterableIterator<{ result: PartiallyComputedPath, astarContext: AStar }>
  *	setGoal(goal: import('./lib/goals').GoalBase | null, dynamic?: boolean): void;
  *	setMovements(movements: Movements): void;
  *	goto(goal: import('./lib/goals').GoalBase, callback?: (error?: Error) => void): Promise<void>;
  *	stop(): void;
  *	isMoving(): boolean;
  *	isMining(): boolean;
  *	isBuilding(): boolean;
 * }} Pathfinder
 */

/**
 * @param {import('mineflayer').Bot} bot
 */
function inject (bot) {
  const waterType = bot.registry.blocksByName['water'].id
  const lavaType = bot.registry.blocksByName['lava'].id
  const ladderId = bot.registry.blocksByName['ladder'].id
  const vineId = bot.registry.blocksByName['vine'].id
  let stateMovements = new Movements(bot)
  /** @type {import('./lib/goals').GoalBase} */
  let stateGoal = null
  /** @type {AStar | null} */
  let astarContext = null
  let astartTimedout = false
  let dynamicGoal = false
  /** @type {Array<Move>} */
  let path = []
  let pathUpdated = false
  let digging = false
  let placing = false
  /** @type {import('./lib/move').ToPlace} */
  let placingBlock = null
  let lastNodeTime = performance.now()
  /** @type {Vec3} */
  let lastPosition = null
  /** @type {any} */
  let returningPos = null
  let stopPathing = false
  /** @type {Array<{ position: Vec3; }>} */
  const openedGates = []

  const physics = new Physics(bot)
  const lockPlaceBlock = new Lock()
  const lockEquipItem = new Lock()
  const lockUseBlock = new Lock()

  // @ts-ignore
  bot.pathfinder = {
    error: 0.35,
    thinkTimeout: 5000, // ms
    tickTimeout: 40, // ms, amount of thinking per tick (max 50 ms)
    searchRadius: Infinity, // in blocks, limits of the search area
    enablePathShortcut: false, // disabled by default as it can cause bugs in specific configurations
    LOSWhenPlacingBlocks: true,
    lookAtTarget: true,
  }

  /**
   * @param {Block} block
   */
  bot.pathfinder.bestHarvestTool = (block) => {
    const availableTools = bot.inventory.items()
    const effects = bot.entity.effects

    let fastest = Number.MAX_VALUE
    let bestTool = null
    for (const tool of availableTools) {
      const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
      const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
      if (digTime < fastest) {
        fastest = digTime
        bestTool = tool
      }
    }

    return bestTool
  }

  /**
   * @param {Movements} movements
   * @param {goals.Goal} goal
   * @param {number} timeout
   */
  bot.pathfinder.getPathTo = (movements, goal, timeout) => {
    const generator = bot.pathfinder.getPathFromTo(movements, bot.entity.position, goal, { timeout })
    const { value: { result, astarContext: context } } = generator.next()
    astarContext = context
    return result
  }

  /**
   * @param {Movements} movements
   * @param {Vec3} startPos
   * @param {goals.Goal} goal
   * @param {{
   *   optimizePath?: boolean;
   *   resetEntityIntersects?: boolean;
   *   timeout?: number;
   *   tickTimeout?: number;
   *   searchRadius?: number;
   *   startMove?: Move;
   * }} [options={}]
   */
  bot.pathfinder.getPathFromTo = function*(movements, startPos, goal, options = {}) {
    const optimizePath = options.optimizePath ?? true
    const resetEntityIntersects = options.resetEntityIntersects ?? true
    const timeout = options.timeout ?? bot.pathfinder.thinkTimeout
    const tickTimeout = options.tickTimeout ?? bot.pathfinder.tickTimeout
    const searchRadius = options.searchRadius ?? bot.pathfinder.searchRadius
    let start
    if (options.startMove) {
      start = options.startMove
    } else {
      const p = startPos.floored()
      const dy = startPos.y - p.y
      const b = bot.blockAt(p) // The block we are standing in
      // Offset the floored bot position by one if we are standing on a block that has not the full height but is solid
      const offset = (b && dy > 0.001 && bot.entity.onGround && !stateMovements.emptyBlocks.has(b.type)) ? 1 : 0
      start = new Move(p.x, p.y + offset, p.z, movements.countScaffoldingItems(), 0, [], [], false, 'forward', 'optional')
    }
    if (movements.allowEntityDetection) {
      if (resetEntityIntersects) {
        movements.clearCollisionIndex()
      }
      movements.updateCollisionIndex()
    }
    const astarContext = new AStar(start, movements, goal, timeout, tickTimeout, searchRadius)
    let result = astarContext.compute()
    if (optimizePath) result.path = postProcessPath(result.path)
    yield { result, astarContext }
    while (result.status === 'partial') {
      result = astarContext.compute()
      if (optimizePath) result.path = postProcessPath(result.path)
      yield { result, astarContext }
    }
  }

  Object.defineProperties(bot.pathfinder, {
    goal: {
      get () {
        return stateGoal
      }
    },
    movements: {
      get () {
        return stateMovements
      }
    },
    path: {
      get () {
        return path
      }
    }
  })

  function detectDiggingStopped () {
    digging = false
    // @ts-ignore
    bot.removeAllListeners('diggingAborted', detectDiggingStopped)
    // @ts-ignore
    bot.removeAllListeners('diggingCompleted', detectDiggingStopped)
  }

  function clearControlStates () {
    bot.setControlState('forward', false)
    bot.setControlState('back', false)
    bot.setControlState('left', false)
    bot.setControlState('right', false)
    bot.setControlState('jump', false)
    bot.setControlState('sprint', false)
    bot.setControlState('sneak', stateMovements.sneak)
  }

  /**
   * @param {GoalUpdateReason} reason
   * @param {boolean} [clearStates]
   */
  function resetPath (reason, clearStates = true) {
    if (!stopPathing && path.length > 0) bot.emit('path_reset', reason)
    path = []
    if (digging) {
      bot.on('diggingAborted', detectDiggingStopped)
      bot.on('diggingCompleted', detectDiggingStopped)
      bot.stopDigging()
    }
    placing = false
    pathUpdated = false
    astarContext = null
    lockEquipItem.release()
    lockPlaceBlock.release()
    lockUseBlock.release()
    stateMovements.clearCollisionIndex()
    if (clearStates) {
      clearControlStates()
    }
    if (stopPathing) return stop()
  }

  /**
   * @param {goals.Goal} goal
   * @param {boolean} [dynamic]
   */
  bot.pathfinder.setGoal = (goal, dynamic = false) => {
    stateGoal = goal
    dynamicGoal = dynamic
    bot.emit('goal_updated', goal, dynamic)
    resetPath('goal_updated')
  }

  /**
   * @param {Movements} movements
   */
  bot.pathfinder.setMovements = (movements) => {
    stateMovements = movements
    resetPath('movements_updated')
  }

  bot.pathfinder.isMoving = () => path.length > 0
  bot.pathfinder.isMining = () => digging
  bot.pathfinder.isBuilding = () => placing

  /**
   * @param {goals.Goal} goal
   */
  bot.pathfinder.goto = (goal) => {
    return gotoUtil(bot, goal)
  }

  bot.pathfinder.stop = () => {
    stopPathing = true
  }

  bot.once('spawn', () => {
    bot.on('physicsTick', monitorMovement)
  })

  /**
   * @param {Array<Move>} path
   */
  function postProcessPath (path) {
    for (let i = 0; i < path.length; i++) {
      const curPoint = path[i]
      if (curPoint.toBreak.length > 0 || curPoint.toPlace.length > 0) break
      const b = bot.blockAt(new Vec3(curPoint.x, curPoint.y, curPoint.z))
      if (b && (b.type === waterType || b.type === lavaType || ((b.type === ladderId || b.type === vineId) && i + 1 < path.length && path[i + 1].y < curPoint.y))) {
        curPoint.x = Math.floor(curPoint.x) + 0.5
        curPoint.y = Math.floor(curPoint.y)
        curPoint.z = Math.floor(curPoint.z) + 0.5
        continue
      }
      let np = getPositionOnTopOf(b)
      if (np === null) np = getPositionOnTopOf(bot.blockAt(new Vec3(curPoint.x, curPoint.y - 1, curPoint.z)))
      if (np) {
        curPoint.x = np.x
        curPoint.y = np.y
        curPoint.z = np.z
      } else {
        curPoint.x = Math.floor(curPoint.x) + 0.5
        curPoint.y = curPoint.y - 1
        curPoint.z = Math.floor(curPoint.z) + 0.5
      }
    }

    if (path.length === 0) return path
    if (stateMovements.exclusionAreasStep.length !== 0) return path

    if (!bot.pathfinder.enablePathShortcut) {
      const newPath = []
      let lastDirection = new Vec3(0, 0, 0)
      for (let i = 1; i < path.length; i++) {
        const previous = path[i - 1]
        const current = path[i]
        const direction = current.clone().subtract(previous)

        if (current.toBreak.length > 0 ||
          current.toPlace.length > 0 ||
          current.dontOptimize ||
          !lastDirection.equals(direction)) {
          newPath.push(previous)
          lastDirection = direction
        }
      }
      newPath.push(path[path.length - 1])
      return newPath
    } else {
      const newPath = []
      let lastNode = bot.entity.position
      for (let i = 1; i < path.length; i++) {
        const previous = path[i - 1]
        const current = path[i]

        if (Math.abs(current.y - lastNode.y) > 0 ||
          current.toBreak.length > 0 ||
          current.toPlace.length > 0 ||
          current.dontOptimize ||
          !physics.canStraightLineBetween(lastNode, current)) {
          newPath.push(previous)
          lastNode = previous
        }
      }
      newPath.push(path[path.length - 1])
      return newPath
    }
  }

  /**
   * @param {Array<Move>} path
   */
  function pathFromPlayer (path) {
    if (path.length === 0) return
    let minI = 0
    let minDistance = 1000
    for (let i = 0; i < path.length; i++) {
      const node = path[i]
      if (node.toBreak.length !== 0 || node.toPlace.length !== 0) break
      const dist = bot.entity.position.distanceSquared(node)
      if (dist < minDistance) {
        minDistance = dist
        minI = i
      }
    }
    // check if we are between 2 nodes
    const n1 = path[minI]
    // check if node already reached
    const dx = n1.x - bot.entity.position.x
    const dy = n1.y - bot.entity.position.y
    const dz = n1.z - bot.entity.position.z

    const reached = Math.abs(dx) <= bot.pathfinder.error && Math.abs(dz) <= bot.pathfinder.error && Math.abs(dy) < 1
    if (minI + 1 < path.length && n1.toBreak.length === 0 && n1.toPlace.length === 0) {
      const n2 = path[minI + 1]
      const d2 = bot.entity.position.distanceSquared(n2)
      const d12 = n1.distanceSquared(n2)
      minI += d12 > d2 || reached ? 1 : 0
    }

    path.splice(0, minI)
  }

  /**
   * @param {Vec3} pos
   * @param {ReadonlyArray<Move>} path
   */
  function isPositionNearPath (pos, path) {
    let prevNode = null
    for (const node of path) {
      let comparisonPoint = null
      if (
        prevNode === null ||
        (
          Math.abs(prevNode.x - node.x) <= 2 &&
          Math.abs(prevNode.y - node.y) <= 2 &&
          Math.abs(prevNode.z - node.z) <= 2
        )
      ) {
        // Unoptimized path, or close enough to last point
        // to just check against the current point
        comparisonPoint = node
      } else {
        // Optimized path - the points are far enough apart
        //   that we need to check the space between them too

        // First, a quick check - if point it outside the path
        // segment's AABB, then it isn't near.
        const minBound = prevNode.min(node)
        const maxBound = prevNode.max(node)
        if (
          pos.x - 0.5 < minBound.x - 1 ||
          pos.x - 0.5 > maxBound.x + 1 ||
          pos.y - 0.5 < minBound.y - 2 ||
          pos.y - 0.5 > maxBound.y + 2 ||
          pos.z - 0.5 < minBound.z - 1 ||
          pos.z - 0.5 > maxBound.z + 1
        ) {
          continue
        }

        comparisonPoint = closestPointOnLineSegment(pos, prevNode, node)
      }

      const dx = Math.abs(comparisonPoint.x - pos.x - 0.5)
      const dy = Math.abs(comparisonPoint.y - pos.y - 0.5)
      const dz = Math.abs(comparisonPoint.z - pos.z - 0.5)
      if (dx <= 1 && dy <= 2 && dz <= 1) return true

      prevNode = node
    }

    return false
  }

  /**
   * @param {Vec3} point
   * @param {Move} segmentStart
   * @param {Move} segmentEnd
   */
  function closestPointOnLineSegment (point, segmentStart, segmentEnd) {
    const segmentLength = segmentEnd.minus(segmentStart).norm()

    if (segmentLength === 0) {
      return segmentStart
    }

    // t is like an interpolation from segmentStart to segmentEnd
    //  for the closest point on the line
    let t = (point.minus(segmentStart)).dot(segmentEnd.minus(segmentStart)) / segmentLength

    // bound t to be on the segment
    t = Math.max(0, Math.min(1, t))

    return segmentStart.plus(segmentEnd.minus(segmentStart).scaled(t))
  }

  /**
   * Return the average x/z position of the highest standing positions
   * in the block.
   * 
   * @param {Block} block
   */
  function getPositionOnTopOf (block) {
    if (!block || block.shapes.length === 0) return null
    const p = new Vec3(0.5, 0, 0.5)
    let n = 1
    for (const shape of block.shapes) {
      const h = shape[4]
      if (h === p.y) {
        p.x += (shape[0] + shape[3]) / 2
        p.z += (shape[2] + shape[5]) / 2
        n++
      } else if (h > p.y) {
        n = 2
        p.x = 0.5 + (shape[0] + shape[3]) / 2
        p.y = h
        p.z = 0.5 + (shape[2] + shape[5]) / 2
      }
    }
    p.x /= n
    p.z /= n
    return block.position.plus(p)
  }

  /**
   * Stop the bot's movement and recenter to the center off the block when the bot's hitbox is partially beyond the
   * current blocks dimensions.
   */
  function fullStop () {
    clearControlStates()

    // Force horizontal velocity to 0 (otherwise inertia can move us too far)
    // Kind of cheaty, but the server will not tell the difference
    bot.entity.velocity.x = 0
    bot.entity.velocity.z = 0

    const blockX = Math.floor(bot.entity.position.x) + 0.5
    const blockZ = Math.floor(bot.entity.position.z) + 0.5

    // Make sure our bounding box don't collide with neighboring blocks
    // otherwise recenter the position
    if (Math.abs(bot.entity.position.x - blockX) > 0.2) { bot.entity.position.x = blockX }
    if (Math.abs(bot.entity.position.z - blockZ) > 0.2) { bot.entity.position.z = blockZ }
  }

  /**
   * @param {Vec3} refBlock
   * @param {Vec3} edge
   */
  function moveToEdge (refBlock, edge) {
    // If allowed turn instantly should maybe be a bot option
    const allowInstantTurn = false
    /**
     * @param {number} pitch
     * @param {number} yaw
     */
    function getViewVector (pitch, yaw) {
      const csPitch = Math.cos(pitch)
      const snPitch = Math.sin(pitch)
      const csYaw = Math.cos(yaw)
      const snYaw = Math.sin(yaw)
      return new Vec3(-snYaw * csPitch, snPitch, -csYaw * csPitch)
    }
    // Target viewing direction while approaching edge
    // The Bot approaches the edge while looking in the opposite direction from where it needs to go
    // The target Pitch angle is roughly the angle the bot has to look down for when it is in the position
    // to place the next block
    const targetBlockPos = refBlock.offset(edge.x + 0.5, edge.y, edge.z + 0.5)
    const targetPosDelta = bot.entity.position.clone().subtract(targetBlockPos)
    const targetYaw = Math.atan2(-targetPosDelta.x, -targetPosDelta.z)
    const targetPitch = -1.421
    const viewVector = getViewVector(targetPitch, targetYaw)
    // While the bot is not in the right position rotate the view and press back while crouching
    if (bot.entity.position.distanceTo(refBlock.clone().offset(edge.x + 0.5, 1, edge.z + 0.5)) > 0.4) {
      bot.lookAt(bot.entity.position.offset(viewVector.x, viewVector.y, viewVector.z), allowInstantTurn)
      bot.setControlState('sneak', true)
      bot.setControlState('back', true)
      return false
    }
    bot.setControlState('back', false)
    if (stateMovements.sneak) { bot.setControlState('sneak', true) }
    return true
  }

  /**
   * @param {Vec3} pos
   */
  function moveToBlock (pos) {
    // minDistanceSq = Min distance sqrt to the target pos were the bot is centered enough to place blocks around him
    const minDistanceSq = 0.2 * 0.2
    const targetPos = pos.clone().offset(0.5, 0, 0.5)
    if (bot.entity.position.distanceSquared(targetPos) > minDistanceSq) {
      bot.lookAt(targetPos)
      bot.setControlState('forward', true)
      if (stateMovements.sneak) { bot.setControlState('sneak', true) }
      return false
    }
    bot.setControlState('forward', false)
    if (stateMovements.sneak) { bot.setControlState('sneak', true) }
    return true
  }

  function stop () {
    stopPathing = false
    stateGoal = null
    path = []
    bot.emit('path_stop')
    fullStop()
  }

  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (!oldBlock || !newBlock) return
    if (isPositionNearPath(oldBlock.position, path) && oldBlock.type !== newBlock.type) {
      resetPath('block_updated', false)
    }
  })

  bot.on('chunkColumnLoad', (chunk) => {
    // Reset only if the new chunk is adjacent to a visited chunk
    if (astarContext) {
      const cx = chunk.x >> 4
      const cz = chunk.z >> 4
      if (astarContext.visitedChunks.has(`${cx - 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz - 1}`) ||
        astarContext.visitedChunks.has(`${cx + 1},${cz}`) ||
        astarContext.visitedChunks.has(`${cx},${cz + 1}`)) {
        resetPath('chunk_loaded', false)
      }
    }
  })

  function monitorMovement () {
    if (openedGates.length > 0 && path.length > 0) {
      const openedGate = openedGates[0]
      const bruh = path[0] ?? new Vec3(0, 0, 0)
      const bruhDx = Math.abs(bruh.x - openedGate.position.x)
      const bruhDy = Math.abs(bruh.y - openedGate.position.y)
      const bruhDz = Math.abs(bruh.z - openedGate.position.z)
      if (bruhDx > 1 || bruhDy > 1 || bruhDz > 1) {
        const gate = bot.blockAt(openedGate.position)
        if (!gate) { throw new Error(`Gate is null`) }
        if (lockUseBlock.tryAcquire()) {
          if (gate.getProperties()['open']) {
            // console.log(`CLOSE GATE ${openedGate.position}`)
            bot.activateBlock(gate).then(() => {
              openedGates.shift()
              lockUseBlock.release()
            }, err => {
              console.error(err)
            })
            return
          }
        }
      }
    }

    // Test freemotion
    if (stateMovements && stateMovements.allowFreeMotion && stateGoal && stateGoal.entity) {
      const target = stateGoal.entity
      if (physics.canStraightLine([target.position], false)) {
        bot.lookAt(target.position.offset(0, 1.6, 0))

        if (target.position.distanceSquared(bot.entity.position) > stateGoal.rangeSq) {
          bot.setControlState('forward', true)
          if (stateMovements.sneak) { bot.setControlState('sneak', true) }
        } else {
          clearControlStates()
        }
        return
      }
    }

    if (stateGoal) {
      if (!stateGoal.isValid()) {
        stop()
      } else if (stateGoal.hasChanged()) {
        stateGoal.refresh?.()
        resetPath('goal_moved', false)
      }
    }

    if (astarContext && astartTimedout) {
      const results = astarContext.compute()
      results.path = postProcessPath(results.path)
      pathFromPlayer(results.path)
      bot.emit('path_update', results)
      path = results.path
      astartTimedout = results.status === 'partial'
    }

    if (bot.pathfinder.LOSWhenPlacingBlocks && returningPos) {
      if (!moveToBlock(returningPos)) return
      returningPos = null
    }

    if (path.length === 0) {
      lastNodeTime = performance.now()
      if (stateGoal && stateMovements) {
        if (stateGoal.isEnd(bot.entity.position.floored())) {
          if (!dynamicGoal) {
            bot.emit('goal_reached', stateGoal)
            stateGoal = null
            fullStop()
          }
        } else if (!pathUpdated) {
          const results = bot.pathfinder.getPathTo(stateMovements, stateGoal)
          bot.emit('path_update', results)
          path = results.path
          astartTimedout = results.status === 'partial'
          pathUpdated = true
        }
      }
    }

    if (path.length === 0) {
      return
    }

    let nextPoint = path[0]
    const p = bot.entity.position

    // Handle digging
    if (digging || nextPoint.toBreak.length > 0) {
      if (!digging && bot.entity.onGround) {
        digging = true
        const b = nextPoint.toBreak.shift()
        if (!b) { throw new Error(`Block position is null`) }
        const block = bot.blockAt(new Vec3(b.x, b.y, b.z), false)
        if (!block) { throw new Error(`Block is null`) }
        const tool = bot.pathfinder.bestHarvestTool(block)
        fullStop()

        const digBlock = () => {
          bot.dig(block, true)
            .catch(_ignoreError => {
              resetPath('dig_error')
            })
            .then(function() {
              lastNodeTime = performance.now()
              digging = false
            })
        }

        if (!tool) {
          digBlock()
        } else {
          bot.equip(tool, 'hand')
            .catch(_ignoreError => { })
            .then(() => digBlock())
        }
      }
      return
    }

    // Handle block placement
    // TODO: sneak when placing or make sure the block is not interactive
    if (placing || nextPoint.toPlace.length > 0) {
      // Open gates or doors
      if (placingBlock?.useOne) {
        const gate = bot.blockAt(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z))
        if (!gate) { throw new Error(`Gate is null`) }
        if (!gate.getProperties()['open']) {
          if (!lockUseBlock.tryAcquire()) return
          // console.log(`OPEN GATE ${gate.position}`)
          if (!openedGates.find(v => v.position.equals(gate.position))) { openedGates.push({ position: gate.position.clone() }) }
          bot.activateBlock(gate).then(() => {
            lockUseBlock.release()
            placingBlock = nextPoint.toPlace.shift()
          }, err => {
            console.error(err)
            lockUseBlock.release()
          })
        } else {
          placingBlock = nextPoint.toPlace.shift()
          // console.log(`GATE ALREADY OPEN ${gate.position}`)
          if (!openedGates.find(v => v.position.equals(gate.position))) { openedGates.push({ position: gate.position.clone() }) }
        }
        return
      }

      if (!placing) {
        placing = true
        placingBlock = nextPoint.toPlace.shift()
        fullStop()
      }

      const block = stateMovements.getScaffoldingItem()
      if (!block) {
        resetPath('no_scaffolding_blocks')
        return
      }

      if (bot.pathfinder.LOSWhenPlacingBlocks && placingBlock.y === bot.entity.position.floored().y - 1 && placingBlock.dy === 0) {
        if (!moveToEdge(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z), new Vec3(placingBlock.dx, 0, placingBlock.dz))) return
      }

      let canPlace = true
      if (placingBlock.jump) {
        bot.setControlState('jump', true)
        canPlace = placingBlock.y + 2 < bot.entity.position.y
      }

      if (canPlace) {
        if (!lockEquipItem.tryAcquire()) return
        const place = () => {
          lockEquipItem.release()
          const refBlock = bot.blockAt(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z), false)
          if (!lockPlaceBlock.tryAcquire()) return
          if (!refBlock) { throw new Error(`Ref block is null`) }
          if (interactableBlocks.includes(refBlock.name)) {
            bot.setControlState('sneak', true)
          }
          bot.setControlState('jump', false)
          bot._placeBlockWithOptions(refBlock, new Vec3(placingBlock.dx, placingBlock.dy, placingBlock.dz), {
            forceLook: 'ignore',
          })
            .then(function() {
              // Dont release Sneak if the block placement was not successful
              bot.setControlState('sneak', stateMovements.sneak)
              if (bot.pathfinder.LOSWhenPlacingBlocks && placingBlock.returnPos) returningPos = placingBlock.returnPos.clone()
            })
            .catch(_ignoreError => {
              resetPath('place_error')
            })
            .then(() => {
              lockPlaceBlock.release()
              placing = false
              lastNodeTime = performance.now()
            })
        }
        if (bot.heldItem?.name !== block.name) {
          bot.equip(block, 'hand')
            .then(function() {
              place()
            })
            .catch(_ignoreError => { })
        } else {
          place()
        }
      }
    }

    /**
     * @param {Move} node 
     */
    const isNodeReached = function(node) {
      const dx = node.x - p.x
      const dy = node.y - p.y
      const dz = node.z - p.z
      return (
        Math.abs(dx) <= bot.pathfinder.error &&
        Math.abs(dz) <= bot.pathfinder.error &&
        Math.abs(dy) < 1
      )
    }

    for (let i = 1; i < Math.min(path.length, 4); i++) {
      const node = path[i]
      if (node.toPlace.length || node.toBreak.length) { break }
      if (!isNodeReached(node)) { continue }
      nextPoint = node
    }

    let dx = nextPoint.x - p.x
    let dy = nextPoint.y - p.y
    let dz = nextPoint.z - p.z

    if (isNodeReached(nextPoint)) {
      // arrived at next point
      lastNodeTime = performance.now()
      if (stopPathing) {
        stop()
        return
      }
      path.shift()
      if (path.length === 0) { // done
        // If the block the bot is standing on is not a full block only checking for the floored position can fail as
        // the distance to the goal can get greater then 0 when the vector is floored.
        if (!dynamicGoal && stateGoal && (stateGoal.isEnd(p.floored()) || stateGoal.isEnd(p.floored().offset(0, 1, 0)))) {
          bot.emit('goal_reached', stateGoal)
          stateGoal = null
        }
        fullStop()
        return
      }
      // not done yet
      nextPoint = path[0]
      if (nextPoint.toBreak.length > 0 || nextPoint.toPlace.length > 0) {
        fullStop()
        return
      }
      dx = nextPoint.x - p.x
      dy = nextPoint.y - p.y
      dz = nextPoint.z - p.z
    }

    /**
     * @param {boolean} lookAtTarget
     */
    const goForward = (lookAtTarget) => {
      const controlsToForward = {
        forward: false,
        left: false,
        right: false,
        back: false,
      }

      const yaw = Math.atan2(-dx, -dz)

      if (!lookAtTarget) {
        let diff = Math.round((yaw - bot.entity.yaw) * (180 / Math.PI))
        if (diff < -180) { diff += 360 }
        // +x   left
        // -x   right
        //  0   forward
        // -180 back

        if (Math.abs(diff) < 22.5) {
          controlsToForward.forward = true
        } else if (Math.abs(diff) > 157.5) {
          controlsToForward.back = true
        } else if (diff > 22.5 && diff < 67.5) {
          controlsToForward.forward = true
          controlsToForward.left = true
        } else if (diff > 67.5 && diff < 112.5) {
          controlsToForward.left = true
        } else if (diff > 112.5 && diff < 157.5) {
          controlsToForward.back = true
          controlsToForward.left = true
        } else if (diff < -22.5 && diff > -67.5) {
          controlsToForward.forward = true
          controlsToForward.right = true
        } else if (diff < -67.5 && diff > -112.5) {
          controlsToForward.right = true
        } else if (diff < -112.5 && diff > -157.5) {
          controlsToForward.back = true
          controlsToForward.right = true
        }
      } else {
        controlsToForward.forward = true
        bot.look(yaw, 0)
      }

      bot.setControlState('forward', controlsToForward.forward)
      bot.setControlState('left', controlsToForward.left)
      bot.setControlState('right', controlsToForward.right)
      bot.setControlState('back', controlsToForward.back)
    }
    const noForward = () => {
      bot.setControlState('forward', false)
      bot.setControlState('left', false)
      bot.setControlState('right', false)
      bot.setControlState('back', false)
    }

    if (bot.entity.isInWater || bot.entity.isInLava) {
      let newTarget = null

      const checkDistance = bot.entity.width / 2

      if (stateMovements.getBlock(bot.entity.position, checkDistance, 0, 0)?.physical) {
        newTarget = bot.entity.position.offset(-0.5, 0, 0)
      } else if (stateMovements.getBlock(bot.entity.position, -checkDistance, 0, 0)?.physical) {
        newTarget = bot.entity.position.offset(0.5, 0, 0)
      }

      if (stateMovements.getBlock(bot.entity.position, 0, 0, checkDistance)?.physical) {
        newTarget = bot.entity.position.offset(0, 0, -0.5)
      } else if (stateMovements.getBlock(bot.entity.position, 0, 0, -checkDistance)?.physical) {
        newTarget = bot.entity.position.offset(0, 0, 0.5)
      }

      if (newTarget) {
        dx = newTarget.x - p.x
        dy = newTarget.y - p.y
        dz = newTarget.z - p.z

        goForward(false)
      } else {
        goForward(bot.pathfinder.lookAtTarget)
      }
      bot.setControlState('jump', true)
      bot.setControlState('sprint', false)
    } else {
      (() => {
        const sprint = {
          'no': false,
          'optional': stateMovements.allowSprinting,
          'yes': true,
        }[nextPoint.sprint]

        switch (nextPoint.type) {
          case 'forward':
          case 'diagonal':
          case 'diagonal-down':
          case 'drop-down':
          case 'down':
            if (physics.canStraightLine(path, sprint)) {
              goForward(bot.pathfinder.lookAtTarget)
              bot.setControlState('jump', false)
              bot.setControlState('sprint', sprint)
              return
            }

            break
          case 'parkour':
            if (physics.canStraightLine(path, sprint)) {
              goForward(bot.pathfinder.lookAtTarget)
              bot.setControlState('jump', false)
              bot.setControlState('sprint', sprint)
              return
            }

            if (physics.canJump(path, sprint)) {
              goForward(bot.pathfinder.lookAtTarget)
              bot.setControlState('jump', true)
              bot.setControlState('sprint', sprint)
              return
            }

            break
          case 'diagonal-up':
          case 'jump-up':
            if (physics.canJump(path, sprint)) {
              goForward(bot.pathfinder.lookAtTarget)
              bot.setControlState('jump', true)
              bot.setControlState('sprint', sprint)
              return
            }

            break
          default:
            console.log(nextPoint.type)
            break
        }

        if (stateMovements.allowSprinting && physics.canStraightLine(path, true)) {
          goForward(bot.pathfinder.lookAtTarget)
          bot.setControlState('jump', false)
          bot.setControlState('sprint', true)
          console.warn('fallback', nextPoint.type, nextPoint.sprint, 'straight-sprint')
          return
        }

        if (stateMovements.allowSprinting && physics.canJump(path, true)) {
          goForward(bot.pathfinder.lookAtTarget)
          bot.setControlState('jump', true)
          bot.setControlState('sprint', true)
          console.warn('fallback', nextPoint.type, nextPoint.sprint, 'jump-sprint')
          return
        }

        if (physics.canStraightLine(path, false)) {
          goForward(bot.pathfinder.lookAtTarget)
          bot.setControlState('jump', false)
          bot.setControlState('sprint', false)
          console.warn('fallback', nextPoint.type, nextPoint.sprint, 'straight')
          return
        }

        if (physics.canJump(path, false)) {
          goForward(bot.pathfinder.lookAtTarget)
          bot.setControlState('jump', true)
          bot.setControlState('sprint', false)
          console.warn('fallback', nextPoint.type, nextPoint.sprint, 'jump')
          return
        }

        {
          goForward(bot.pathfinder.lookAtTarget)
          bot.setControlState('jump', false)
          bot.setControlState('sprint', false)
          console.warn('fallback', nextPoint.type, nextPoint.sprint, 'default')
        }
      })()
    }

    if (stateMovements.sneak) { bot.setControlState('sneak', true) }

    // check for futility
    if (!lastPosition || bot.entity.position.clone().distanceSquared(lastPosition) >= 1) {
      lastPosition = bot.entity.position.clone()
      lastNodeTime = performance.now()
    } else if (performance.now() - lastNodeTime > 1000) {
      resetPath('stuck')
    }
  }
}

module.exports = {
  pathfinder: inject,
  Movements: require('./lib/movements'),
  goals: goals,
}
