const { Vec3 } = require('vec3')

/**
 * @typedef {{
 *   x: number;
 *   y: number;
 *   z: number;
 *   dx: number;
 *   dy: number;
 *   dz: number;
 *   useOne?: boolean;
 *   jump?: boolean;
 *   returnPos?: Vec3;
 * }} ToPlace
 */

/**
 * @typedef {Vec3} ToBreak
 */

/**
 * @typedef {'forward' | 'jump-up' | 'diagonal-up' | 'diagonal' | 'diagonal-down' | 'down' | 'drop-down' | 'up' | 'parkour'} MoveType
 */

/**
 * @typedef {'no' | 'optional' | 'yes'} SprintType
 */

class Move extends Vec3 {
  /** @readonly @type {number} */ remainingBlocks
  /** @readonly @type {number} */ cost
  /** @readonly @type {Array<ToBreak>} */ toBreak
  /** @readonly @type {Array<ToPlace>} */ toPlace
  /** @readonly @type {boolean} */ dontOptimize
  /** @readonly @type {string} */ hash
  /** @readonly @type {MoveType} */ type
  /** @readonly @type {SprintType} */ sprint

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} remainingBlocks
   * @param {number} cost
   * @param {Array<ToBreak>} toBreak
   * @param {Array<ToPlace>} toPlace
   * @param {boolean} dontOptimize
   * @param {MoveType} type
   * @param {SprintType} sprint
   */
  constructor (x, y, z, remainingBlocks, cost, toBreak, toPlace, dontOptimize, type, sprint) {
    super(Math.floor(x), Math.floor(y), Math.floor(z))
    this.remainingBlocks = remainingBlocks
    this.cost = cost
    this.toBreak = toBreak
    this.toPlace = toPlace
    this.dontOptimize = dontOptimize
    this.type = type
    this.sprint = sprint

    this.hash = this.x + ',' + this.y + ',' + this.z
  }
}

module.exports = Move
