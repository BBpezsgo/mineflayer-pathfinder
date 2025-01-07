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
 * @exports
 */
class Move extends Vec3 {
  /** @readonly @type {number} */
  remainingBlocks

  /** @readonly @type {number} */
  cost

  /** @readonly @type {Array<Vec3>} */
  toBreak

  /** @readonly @type {Array<ToPlace>} */
  toPlace

  /** @readonly @type {boolean} */
  parkour

  /** @readonly @type {string} */
  hash

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} remainingBlocks
   * @param {number} cost
   * @param {Array<ToBreak>} [toBreak = []]
   * @param {Array<ToPlace>} [toPlace = []]
   * @param {boolean} [parkour = false]
   */
  constructor(x, y, z, remainingBlocks, cost, toBreak = [], toPlace = [], parkour = false) {
    super(Math.floor(x), Math.floor(y), Math.floor(z))
    this.remainingBlocks = remainingBlocks
    this.cost = cost
    this.toBreak = toBreak
    this.toPlace = toPlace
    this.parkour = parkour

    this.hash = this.x + ',' + this.y + ',' + this.z
  }
}

module.exports = Move
