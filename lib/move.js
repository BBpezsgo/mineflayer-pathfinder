const { Vec3 } = require('vec3')

/**
 * @typedef {{
 *   x: number
 *   y: number
 *   z: number
 *   dx: number
 *   dy: number
 *   dz: number
 *   jump?: boolean
 *   returnPos?: Vec3
 * }} ToPlace
 */

/**
 * @typedef {Vec3} ToBreak
 */

class Move extends Vec3 {
  /** @readonly @type {any} */
  remainingBlocks

  /** @readonly @type {any} */
  cost

  /** @readonly @type {Array<any>} */
  toBreak

  /** @readonly @type {Array<any>} */
  toPlace

  /** @readonly @type {boolean} */
  parkour

  /** @readonly @type {string} */
  hash

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {any} remainingBlocks
   * @param {any} cost
   * @param {Array<ToBreak>} [toBreak = []]
   * @param {Array<ToPlace>} [toPlace = []]
   * @param {boolean} [parkour = false]
   */
  constructor (x, y, z, remainingBlocks, cost, toBreak = [], toPlace = [], parkour = false) {
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
