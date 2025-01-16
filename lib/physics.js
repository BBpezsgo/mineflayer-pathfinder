const { PlayerState } = require('prismarine-physics')

class Physics {
  /**
   * @param {import('mineflayer').Bot} bot
   */
  constructor (bot) {
    this.bot = bot
    this.world = {
      getBlock: (/** @type {import('vec3').Vec3} */ pos) => {
        return bot.blockAt(pos, false)
      }
    }
  }

  /**
   * @param {function} goal A function is the goal has been reached or not
   * @param {function} [controller] Controller that can change the current control State for the next tick
   * @param {number} [ticks] Number of ticks to simulate
   * @param {PlayerState | null} [state] Starting control state to begin the simulation with
   * @returns {PlayerState} A player state of the final simulation tick
   */
  simulateUntil (goal, controller = () => { }, ticks = 1, state = null) {
    if (!state) {
      const simulationControl = {
        forward: this.bot.controlState.forward,
        back: this.bot.controlState.back,
        left: this.bot.controlState.left,
        right: this.bot.controlState.right,
        jump: this.bot.controlState.jump,
        sprint: this.bot.controlState.sprint,
        sneak: this.bot.controlState.sneak
      }
      state = new PlayerState(this.bot, simulationControl)
    }

    for (let i = 0; i < ticks; i++) {
      controller(state, i)
      this.bot.physics.simulatePlayer(state, this.world)
      if (state.isInLava) return state
      if (goal(state)) return state
    }

    return state
  }

  simulateUntilNextTick () {
    return this.simulateUntil(() => false, () => { }, 1)
  }

  simulateUntilOnGround (ticks = 5) {
    return this.simulateUntil((/** @type {PlayerState} */ state) => state.onGround, () => { }, ticks)
  }

  /**
   * @param {ReadonlyArray<import('./move')>} path
   * @param {boolean} sprint
   */
  canStraightLine (path, sprint) {
    const reached = this.getReached(path)
    const state = this.simulateUntil(reached, this.getController(path[0], false, sprint), 200)
    if (reached(state)) return true

    if (sprint) {
      if (this.canSprintJump(path, 0)) return false
    } else {
      if (this.canWalkJump(path, 0)) return false
    }

    for (let i = 1; i < 7; i++) {
      if (sprint) {
        if (this.canSprintJump(path, i)) return true
      } else {
        if (this.canWalkJump(path, i)) return true
      }
    }
    return false
  }

  /**
   * @param {import('vec3').Vec3} n1
   * @param {import('./move')} n2
   */
  canStraightLineBetween (n1, n2) {
    const reached = (/** @type {PlayerState} */ state) => {
      const delta = n2.minus(state.pos)
      const r2 = 0.15 * 0.15
      return (delta.x * delta.x + delta.z * delta.z) <= r2 && Math.abs(delta.y) < 0.001 && (state.onGround || state.isInWater)
    }
    const simulationControl = {
      forward: this.bot.controlState.forward,
      back: this.bot.controlState.back,
      left: this.bot.controlState.left,
      right: this.bot.controlState.right,
      jump: this.bot.controlState.jump,
      sprint: this.bot.controlState.sprint,
      sneak: this.bot.controlState.sneak
    }
    const state = new PlayerState(this.bot, simulationControl)
    state.pos.update(n1)
    this.simulateUntil(reached, this.getController(n2, false, true), Math.floor(5 * n1.distanceTo(n2)), state)
    return reached(state)
  }

  /**
   * @param {ReadonlyArray<import('./move')>} path
   * @param {boolean} sprint
   */
  canJump (path, sprint, jumpAfter = 0) {
    const reached = this.getReached(path)
    const state = this.simulateUntil(reached, this.getController(path[0], true, sprint, jumpAfter), 20)
    return reached(state)
  }

  /**
   * @param {ReadonlyArray<import('./move')>} path
   */
  canSprintJump (path, jumpAfter = 0) {
    const reached = this.getReached(path)
    const state = this.simulateUntil(reached, this.getController(path[0], true, true, jumpAfter), 20)
    return reached(state)
  }

  /**
   * @param {ReadonlyArray<import('./move')>} path
   */
  canWalkJump (path, jumpAfter = 0) {
    const reached = this.getReached(path)
    const state = this.simulateUntil(reached, this.getController(path[0], true, false, jumpAfter), 20)
    return reached(state)
  }

  /**
   * @param {ReadonlyArray<import('./move')>} path
   */
  getReached (path) {
    return (/** @type {{ pos: import('vec3').Vec3; }} */ state) => {
      const delta = path[0].minus(state.pos)
      return Math.abs(delta.x) <= this.bot.pathfinder.error && Math.abs(delta.z) <= this.bot.pathfinder.error && Math.abs(delta.y) < 1
    }
  }

  /**
   * @param {import('./move')} nextPoint
   * @param {boolean} jump
   * @param {boolean} sprint
   */
  getController (nextPoint, jump, sprint, jumpAfter = 0) {
    return (/** @type {PlayerState} */ state, /** @type {number} */ tick) => {
      const dx = nextPoint.x - state.pos.x
      const dz = nextPoint.z - state.pos.z
      state.yaw = Math.atan2(-dx, -dz)

      state.control.forward = true
      state.control.jump = jump && tick >= jumpAfter
      state.control.sprint = sprint
    }
  }
}

module.exports = Physics
