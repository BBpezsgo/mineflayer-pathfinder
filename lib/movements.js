const { Vec3 } = require('vec3')
const nbt = require('prismarine-nbt')
const { Move } = require('./move')

const doors = [
  'oak_door',
  'spruce_door',
  'birch_door',
  'jungle_door',
  'acacia_door',
  'dark_oak_door',
  'mangrove_door',
  'cherry_door',
  'bamboo_door',
  'crimson_door',
  'warped_door',
]

/**
 * @typedef {Vec3 & {
 *   remainingBlocks: number;
 * }} Node
 */

/**
 * @typedef {{
 *   x: number;
 *   z: number;
 * }} VecXZ
 */

/**
 * @typedef {{
*   x: number;
*   y: number;
*   z: number;
* }} VecXYZ
*/

const cardinalDirections = [
  { x: -1, z: 0 }, // West
  { x: 1, z: 0 }, // East
  { x: 0, z: -1 }, // North
  { x: 0, z: 1 } // South
]
const diagonalDirections = [
  { x: -1, z: -1 },
  { x: -1, z: 1 },
  { x: 1, z: -1 },
  { x: 1, z: 1 }
]

class Movements {

  /**
   * @readonly
   * @type {import('mineflayer').Bot}
   */
  bot

  /**
   * @type {boolean}
   */
  canDig

  /**
   * @type {boolean}
   */
  canOpenDoors

  /**
   * @type {boolean}
   */
  sneak

  /**
   * @type {boolean}
   */
  dontCreateFlow

  /**
   * @type {boolean}
   */
  dontMineUnderFallingBlock

  /**
   * @type {boolean}
   */
  allow1by1towers

  /**
   * @type {boolean}
   */
  allowFreeMotion

  /**
   * @type {boolean}
   */
  allowParkour

  /**
   * @type {boolean}
   */
  allowSprinting

  /**
   * Test for entities that may obstruct path or prevent block placement. Grabs updated entities every new path
   * @type {boolean}
   */
  allowEntityDetection

  /**
   * Set of entities (by mcdata name) to completely avoid when using entity detection
   * @type {Set<string>}
   */
  entitiesToAvoid

  /**
   * Set of entities (by mcdata name) to ignore when using entity detection
   * @type {Set<string>}
   */
  passableEntities

  /**
   * Set of blocks (by mcdata name) that pathfinder should not attempt to place blocks or 'right click' on
   * @type {Set<string>}
   */
  interactableBlocks

  /** @type {Set<number>} */ blocksCantBreak
  /** @type {Set<number>} */ blocksCanBreakAnyway
  /** @type {Set<number>} */ blocksToAvoid
  /** @type {Set<number>} */ liquids
  /** @type {Set<number>} */ gravityBlocks
  /** @type {Set<number>} */ climbables
  /** @type {Set<number>} */ emptyBlocks
  /** @type {Set<number>} */ replaceables
  /** @type {Set<number>} */ fences
  /** @type {Set<number>} */ carpets
  /** @type {Set<number>} */ openable
  /** @type {Array<number>} */ scafoldingBlocks

  /** @type {number} */ maxDropDown
  /** @type {boolean} */ infiniteLiquidDropdownDistance
  /** @type {number} */ digCost
  /** @type {number} */ placeCost
  /** @type {number} */ liquidCost

  /**
   * Extra cost multiplier for moving through an entity hitbox (besides passable ones).
   * @type {number}
   */
  entityCost

  /**
   * Exclusion Area that adds extra cost or prevents the bot from stepping onto positions included.
   * @example
   * ```js
    movements.exclusionAreas = [(block) => {
      return block.type === someIdType ? Infinity : 0
    },
    (block) => {
      return someVec3Pos.distanceTo(block.position) < 5 ? Infinity : 0
    }]
    ```
    * @type {Array<(block: import('mineflayer-pathfinder').SafeBlock) => number>}
    */
  exclusionAreasStep

  /**
   * Exclusion area for blocks to break. Works in the same way as {@link exclusionAreasStep} does. 
   * @type {Array<(block: import('mineflayer-pathfinder').SafeBlock) => number>}
   */
  exclusionAreasBreak

  /**
   * Exclusion area for placing blocks. Note only works for positions not block values as placed blocks are determined by the bots inventory content. Works in the same way as {@link exclusionAreasStep} does. 
   * @type {Array<(block: import('mineflayer-pathfinder').SafeBlock) => number>}
   */
  exclusionAreasPlace

  /**
    * A dictionary of the number of entities intersecting each floored block coordinate.
    * Updated automatically each path but, you may mix in your own entries before calculating a path if desired (generally for testing).
    * To prevent this from being cleared automatically before generating a path see getPathFromTo()
    * formatted entityIntersections['x,y,z'] = #ents
    * @type {Record<string, number>}
    */
  entityIntersections

  /**
   * @param {import('mineflayer').Bot} bot
   */
  constructor(bot) {
    const registry = bot.registry
    this.bot = bot

    this.canDig = true
    this.sneak = false
    this.digCost = 1
    this.placeCost = 1
    this.liquidCost = 1
    this.entityCost = 1

    this.dontCreateFlow = true
    this.dontMineUnderFallingBlock = true
    this.allow1by1towers = true
    this.allowFreeMotion = false
    this.allowParkour = true
    this.allowSprinting = true
    this.allowEntityDetection = true

    this.entitiesToAvoid = new Set()
    // @ts-ignore
    this.passableEntities = new Set(require('./passableEntities.json'))
    // @ts-ignore
    this.interactableBlocks = new Set(require('./interactable.json'))

    this.blocksCantBreak = new Set()
    this.blocksCantBreak.add(registry.blocksByName.chest.id)

    this.blocksCanBreakAnyway = new Set()

    registry.blocksArray.forEach((/** @type {import('minecraft-data').Block} */ block) => {
      if (block.diggable) return
      this.blocksCantBreak.add(block.id)
    })

    this.blocksToAvoid = new Set()
    this.blocksToAvoid.add(registry.blocksByName.fire.id)
    if (registry.blocksByName.cobweb) this.blocksToAvoid.add(registry.blocksByName.cobweb.id)
    if (registry.blocksByName.web) this.blocksToAvoid.add(registry.blocksByName.web.id)
    this.blocksToAvoid.add(registry.blocksByName.lava.id)

    this.liquids = new Set()
    this.liquids.add(registry.blocksByName.water.id)
    this.liquids.add(registry.blocksByName.lava.id)

    this.gravityBlocks = new Set()
    this.gravityBlocks.add(registry.blocksByName.sand.id)
    this.gravityBlocks.add(registry.blocksByName.gravel.id)

    this.climbables = new Set()
    this.climbables.add(registry.blocksByName.ladder.id)
    // this.climbables.add(registry.blocksByName.vine.id)
    this.emptyBlocks = new Set()

    this.replaceables = new Set()
    this.replaceables.add(registry.blocksByName.air.id)
    if (registry.blocksByName.cave_air) this.replaceables.add(registry.blocksByName.cave_air.id)
    if (registry.blocksByName.void_air) this.replaceables.add(registry.blocksByName.void_air.id)
    this.replaceables.add(registry.blocksByName.water.id)
    this.replaceables.add(registry.blocksByName.lava.id)

    this.scafoldingBlocks = []
    this.scafoldingBlocks.push(registry.itemsByName.dirt.id)
    this.scafoldingBlocks.push(registry.itemsByName.cobblestone.id)

    const Block = require('prismarine-block')(bot.registry)
    this.fences = new Set()
    this.carpets = new Set()
    this.openable = new Set()
    // @ts-ignore
    registry.blocksArray.map((/** @type {import('minecraft-data').Block} */ x) => Block.fromStateId(x.minStateId, 0)).forEach((/** @type {import('prismarine-block').Block} */ block) => {
      if (block.name === 'end_portal' ||
          block.name === 'nether_portal') {
        this.emptyBlocks.add(block.type)
      } else if (block.shapes.length > 0) {
        // Fences or any block taller than 1, they will be considered as non-physical to avoid
        // trying to walk on them
        if (block.shapes[0][4] > 1) this.fences.add(block.type)
        // Carpets or any blocks smaller than 0.1, they will be considered as safe to walk in
        if (block.shapes[0][4] < 0.1) this.carpets.add(block.type)
      } else if (block.shapes.length === 0) {
        this.emptyBlocks.add(block.type)
      }
    })
    registry.blocksArray.forEach((/** @type {import('minecraft-data').Block} */ block) => {
      if (this.interactableBlocks.has(block.name) && block.name.toLowerCase().includes('gate') && !block.name.toLowerCase().includes('iron')) {
        // console.info(block)
        this.openable.add(block.id)
      }
    })

    this.canOpenDoors = false // Causes issues. Probably due to none paper servers.

    this.exclusionAreasStep = []
    this.exclusionAreasBreak = []
    this.exclusionAreasPlace = []

    this.maxDropDown = 4
    this.infiniteLiquidDropdownDistance = true

    this.entityIntersections = {}
  }

  /**
   * @param {import("mineflayer-pathfinder").SafeBlock} block
   */
  exclusionPlace(block) {
    if (this.exclusionAreasPlace.length === 0) return 0
    let weight = 0
    for (const a of this.exclusionAreasPlace) {
      weight += a(block)
    }
    return weight
  }

  /**
   * @param {import("mineflayer-pathfinder").SafeBlock} block
   */
  exclusionStep(block) {
    if (this.exclusionAreasStep.length === 0) return 0
    let weight = 0
    for (const a of this.exclusionAreasStep) {
      weight += a(block)
    }
    return weight
  }


  /**
   * @param {Node} node
   * @param {import("mineflayer-pathfinder").SafeBlock} block
   */
  landingCost(node, block) {
    // const height = node.y - block.position.y
    if (block.name === 'farmland') {
      return 100
    }
    return 0
  }

  /**
   * @param {import("mineflayer-pathfinder").SafeBlock} block
   */
  exclusionBreak(block) {
    if (this.exclusionAreasBreak.length === 0) return 0
    let weight = 0
    for (const a of this.exclusionAreasBreak) {
      weight += a(block)
    }
    return weight
  }

  countScaffoldingItems() {
    let count = 0
    const items = this.bot.inventory.items()
    for (const id of this.scafoldingBlocks) {
      for (const j in items) {
        const item = items[j]
        if (item.type === id) count += item.count
      }
    }
    return count
  }

  getScaffoldingItem() {
    const items = this.bot.inventory.items()
    for (const id of this.scafoldingBlocks) {
      for (const j in items) {
        const item = items[j]
        if (item.type === id) return item
      }
    }
    return null
  }

  clearCollisionIndex() {
    this.entityIntersections = {}
  }

  /**
   * Finds blocks intersected by entity bounding boxes
   * and sets the number of ents intersecting in a dict.
   * Ignores entities that do not affect block placement
   */
  updateCollisionIndex() {
    for (const ent of Object.values(this.bot.entities)) {
      if (ent === this.bot.entity) { continue }
      if (!ent.name) { continue }

      const avoidedEnt = this.entitiesToAvoid.has(ent.name)
      if (avoidedEnt || !this.passableEntities.has(ent.name)) {
        const entSquareRadius = ent.width / 2.0
        const minY = Math.floor(ent.position.y)
        const maxY = Math.ceil(ent.position.y + ent.height)
        const minX = Math.floor(ent.position.x - entSquareRadius)
        const maxX = Math.ceil(ent.position.x + entSquareRadius)
        const minZ = Math.floor(ent.position.z - entSquareRadius)
        const maxZ = Math.ceil(ent.position.z + entSquareRadius)

        const cost = avoidedEnt ? Infinity : 1

        for (let y = minY; y < maxY; y++) {
          for (let x = minX; x < maxX; x++) {
            for (let z = minZ; z < maxZ; z++) {
              this.entityIntersections[`${x},${y},${z}`] = this.entityIntersections[`${x},${y},${z}`] ?? 0
              this.entityIntersections[`${x},${y},${z}`] += cost // More ents = more weight
            }
          }
        }
      }
    }
  }

  /**
   * Gets number of entities who's bounding box intersects the node + offset
   * @param {import('vec3').Vec3} pos node position
   * @param {number} dx X axis offset
   * @param {number} dy Y axis offset
   * @param {number} dz Z axis offset
   * @returns {number} Number of entities intersecting block
   */
  getNumEntitiesAt(pos, dx, dy, dz) {
    if (this.allowEntityDetection === false) return 0
    if (!pos) return 0
    const y = pos.y + dy
    const x = pos.x + dx
    const z = pos.z + dz

    return this.entityIntersections[`${x},${y},${z}`] ?? 0
  }

  /**
   * @param {Vec3} pos
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @returns {import('mineflayer-pathfinder').SafeBlock}
   */
  getBlock(pos, dx, dy, dz) {
    /** @type {import('mineflayer-pathfinder').SafeBlock | null} */ // @ts-ignore
    const b = pos ? this.bot.blockAt(new Vec3(pos.x + dx, pos.y + dy, pos.z + dz), false) : null
    if (!b) {
      // @ts-ignore
      return {
        replaceable: false,
        canFall: false,
        safe: false,
        physical: false,
        liquid: false,
        climbable: false,
        height: dy,
        openable: false,
        position: pos.clone(),
      }
    }
    b.climbable = this.climbables.has(b.type)
    b.safe = (this.emptyBlocks.has(b.type) || b.boundingBox === 'empty' || b.climbable || this.carpets.has(b.type)) && !this.blocksToAvoid.has(b.type)
    b.physical = b.boundingBox === 'block' && !this.fences.has(b.type) && !this.emptyBlocks.has(b.type) && (b.name !== 'composter' && b.name !== 'cauldron' && b.name !== 'water_cauldron' && b.name !== 'lava_cauldron' && b.name !== 'powder_snow_cauldron')
    b.replaceable = this.replaceables.has(b.type) && !b.physical
    b.liquid = this.liquids.has(b.type)
    b.height = pos.y + dy
    b.canFall = this.gravityBlocks.has(b.type)
    b.openable = this.openable.has(b.type)

    for (const shape of b.shapes) {
      b.height = Math.max(b.height, pos.y + dy + shape[4])
    }

    return b
  }

  /**
   * Takes into account if the block is within a break exclusion area.
   * @param {import("mineflayer-pathfinder").SafeBlock} block
   * @returns
   */
  safeToBreak(block) {
    if (!this.canDig && !this.blocksCanBreakAnyway.has(block.type)) {
      return false
    }

    if (this.dontCreateFlow) {
      // false if next to liquid
      if (this.getBlock(block.position, 0, 1, 0).liquid) return false
      if (this.getBlock(block.position, -1, 0, 0).liquid) return false
      if (this.getBlock(block.position, 1, 0, 0).liquid) return false
      if (this.getBlock(block.position, 0, 0, -1).liquid) return false
      if (this.getBlock(block.position, 0, 0, 1).liquid) return false
    }

    if (this.dontMineUnderFallingBlock) {
      // TODO: Determine if there are other blocks holding the entity up
      if (this.getBlock(block.position, 0, 1, 0).canFall || (this.getNumEntitiesAt(block.position, 0, 1, 0) > 0)) {
        return false
      }
    }

    return block.type && !this.blocksCantBreak.has(block.type) && this.exclusionBreak(block) < Infinity
  }

  /**
   * Takes into account if the block is within the stepExclusionAreas. And returns Infinity if a block to be broken is within break exclusion areas.
   * @param {import("mineflayer-pathfinder").SafeBlock} block block
   * @param {Array<Vec3>} toBreak
   * @returns {number}
   */
  safeOrBreak(block, toBreak) {
    let cost = 0
    cost += this.exclusionStep(block) // Is excluded so can't move or break
    cost += this.getNumEntitiesAt(block.position, 0, 0, 0) * this.entityCost
    if (block.safe) return cost
    if (!this.safeToBreak(block)) return Infinity // Can't break, so can't move
    toBreak.push(block.position)

    if (block.physical) {
      cost += this.getNumEntitiesAt(block.position, 0, 1, 0) * this.entityCost // Add entity cost if there is an entity above (a breakable block) that will fall
    }

    const tool = this.bot.pathfinder.bestHarvestTool(block)
    const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
    const effects = this.bot.entity.effects
    const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
    const laborCost = (1 + 3 * digTime / 1000) * this.digCost
    cost += laborCost
    return cost
  }

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveJumpUp(node, dir, neighbors) {
    const blockAboveHead = this.getBlock(node, 0, 2, 0)
    const blockHeadAfter = this.getBlock(node, dir.x, 2, dir.z)
    const blockFootAfter = this.getBlock(node, dir.x, 1, dir.z)
    const blockGroundAfter = this.getBlock(node, dir.x, 0, dir.z)

    let cost = 2 // move cost (move+jump)
    const toBreak = []
    const toPlace = []

    if (doors.includes(blockGroundAfter.name)) { return }

    if (blockAboveHead.physical && (this.getNumEntitiesAt(blockAboveHead.position, 0, 1, 0) > 0)) return // Blocks A, B and H are above C, D and the player's space, we need to make sure there are no entities that will fall down onto our building space if we break them
    if (blockHeadAfter.physical && (this.getNumEntitiesAt(blockHeadAfter.position, 0, 1, 0) > 0)) return
    if (blockFootAfter.physical && !blockHeadAfter.physical && !blockGroundAfter.physical && (this.getNumEntitiesAt(blockFootAfter.position, 0, 1, 0) > 0)) return // It is fine if an ent falls on B so long as we don't need to replace block C

    const isCarpetFence = (
      this.fences.has(blockGroundAfter.type) &&
      this.carpets.has(blockFootAfter.type)
    )

    if (!isCarpetFence && !blockGroundAfter.physical && blockGroundAfter.name !== 'end_portal') {
      if (node.remainingBlocks === 0) return // not enough blocks to place

      if (this.getNumEntitiesAt(blockGroundAfter.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

      const blockD = this.getBlock(node, dir.x, -1, dir.z)
      if (!blockD.physical) {
        if (node.remainingBlocks === 1) return // not enough blocks to place

        if (this.getNumEntitiesAt(blockD.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

        if (!blockD.replaceable) {
          if (!this.safeToBreak(blockD)) return
          cost += this.exclusionBreak(blockD)
          toBreak.push(blockD.position)
        }
        cost += this.exclusionPlace(blockD)
        toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z, returnPos: new Vec3(node.x, node.y, node.z) })
        cost += this.placeCost // additional cost for placing a block
      }

      if (!blockGroundAfter.replaceable) {
        if (!this.safeToBreak(blockGroundAfter)) return
        cost += this.exclusionBreak(blockGroundAfter)
        toBreak.push(blockGroundAfter.position)
      }
      cost += this.exclusionPlace(blockGroundAfter)
      toPlace.push({ x: node.x + dir.x, y: node.y - 1, z: node.z + dir.z, dx: 0, dy: 1, dz: 0 })
      cost += this.placeCost // additional cost for placing a block

      blockGroundAfter.height += 1
    }

    if (!isCarpetFence) {
      const blockGround = this.getBlock(node, 0, -1, 0)
      if (blockGroundAfter.height - blockGround.height > 1.2) {
        return // Too high to jump
      }
    }

    cost += this.landingCost(node, blockGroundAfter)
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockAboveHead, toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockHeadAfter, toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockFootAfter, toBreak)
    if (cost === Infinity) return

    neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveForward(node, dir, neighbors) {
    const blockHeadAfter = this.getBlock(node, dir.x, 1, dir.z)
    const blockFootAfter = this.getBlock(node, dir.x, 0, dir.z)
    const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)

    let cost = 1 // move cost
    cost += this.exclusionStep(blockFootAfter)

    /** @type {Array<import('./move').ToBreak>} */
    const toBreak = []
    /** @type {Array<import('./move').ToPlace>} */
    const toPlace = []

    if (doors.includes(blockGroundAfter.name)) { return }

    if (!blockGroundAfter.physical &&
        !blockFootAfter.liquid &&
        blockGroundAfter.name !== 'end_portal') {
      if (node.remainingBlocks === 0) return // not enough blocks to place

      if (this.getNumEntitiesAt(blockGroundAfter.position, 0, 0, 0) > 0) return // D intersects an entity hitbox

      if (!blockGroundAfter.replaceable) {
        if (!this.safeToBreak(blockGroundAfter)) return
        cost += this.exclusionBreak(blockGroundAfter)
        toBreak.push(blockGroundAfter.position)
      }
      cost += this.exclusionPlace(blockFootAfter)
      toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: dir.x, dy: 0, dz: dir.z })
      cost += this.placeCost // additional cost for placing a block
    }

    // Open fence gates
    let isGateOpening = false
    if (this.canOpenDoors && blockFootAfter.openable) {
      // if (blockFootAfter.shapes && blockFootAfter.shapes.length !== 0) {
      toPlace.push({ x: node.x + dir.x, y: node.y, z: node.z + dir.z, dx: 0, dy: 0, dz: 0, useOne: true }) // Indicate that a block should be used on this block not placed
      isGateOpening = true
      // }
    }

    if (!isGateOpening) {
      cost += this.safeOrBreak(blockFootAfter, toBreak)
      cost += this.safeOrBreak(blockHeadAfter, toBreak)
      if (cost === Infinity) return
    }

    if (this.getBlock(node, 0, 0, 0).liquid) cost += this.liquidCost

    neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveDiagonal(node, dir, neighbors) {
    let cost = Math.SQRT2 // move cost
    const toBreak = []

    const blockFootAfter = this.getBlock(node, dir.x, 0, dir.z) // Landing block or standing on block when jumping up by 1
    const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)
    const jump = blockFootAfter.physical ? 1 : 0

    const blockGround = this.getBlock(node, 0, -1, 0)

    if (!jump) {
      const blockFoot1During = this.getBlock(node, dir.x, 0, 0)
      const blockFoot2During = this.getBlock(node, 0, 0, dir.z)
      const blockHead1During = this.getBlock(node, dir.x, 1, 0)
      const blockHead2During = this.getBlock(node, 0, 1, dir.z)
      if (blockFoot1During.physical || blockFoot2During.physical ||
        blockHead1During.physical || blockHead2During.physical) {
        return
      }
    }

    let cost1 = 0
    /** @type {Array<Vec3>} */
    const toBreak1 = []
    const blockB1 = this.getBlock(node, 0, jump + 1, dir.z)
    const blockC1 = this.getBlock(node, 0, jump, dir.z)
    const blockD1 = this.getBlock(node, 0, jump - 1, dir.z)
    cost1 += this.safeOrBreak(blockB1, toBreak1)
    cost1 += this.safeOrBreak(blockC1, toBreak1)
    if (blockD1.height - blockGround.height > 1.2) cost1 += this.safeOrBreak(blockD1, toBreak1)

    let cost2 = 0
    /**
     * @type {Array<Vec3>}
     */
    const toBreak2 = []
    const blockB2 = this.getBlock(node, dir.x, jump + 1, 0)
    const blockC2 = this.getBlock(node, dir.x, jump, 0)
    const blockD2 = this.getBlock(node, dir.x, jump - 1, 0)
    cost2 += this.safeOrBreak(blockB2, toBreak2)
    cost2 += this.safeOrBreak(blockC2, toBreak2)
    if (blockD2.height - blockGround.height > 1.2) cost2 += this.safeOrBreak(blockD2, toBreak2)

    if (cost1 < cost2) {
      cost += cost1
      toBreak.push(...toBreak1)
    } else {
      cost += cost2
      toBreak.push(...toBreak2)
    }
    if (cost === Infinity) return

    cost += this.safeOrBreak(this.getBlock(node, dir.x, jump, dir.z), toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(this.getBlock(node, dir.x, jump + 1, dir.z), toBreak)
    if (cost === Infinity) return

    if (this.getBlock(node, 0, 0, 0).liquid) cost += this.liquidCost

    if (jump) {
      if (blockFootAfter.height - blockGround.height > 1.2) return
      cost += this.safeOrBreak(this.getBlock(node, 0, 2, 0), toBreak)
      if (cost === Infinity) return
      cost += 1
      neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y + 1, blockFootAfter.position.z, node.remainingBlocks, cost, toBreak))
    } else if (blockGroundAfter.physical || blockFootAfter.liquid) {
      neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks, cost, toBreak))
    } else if (this.getBlock(node, dir.x, -2, dir.z).physical || blockGroundAfter.liquid) {
      if (!blockGroundAfter.safe) return // don't self-immolate
      cost += this.getNumEntitiesAt(blockFootAfter.position, 0, -1, 0) * this.entityCost
      neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y - 1, blockFootAfter.position.z, node.remainingBlocks, cost, toBreak))
    }
  }

  /**
   * @param {Vec3} node
   * @param {VecXZ} dir
   */
  getLandingBlock(node, dir) {
    let blockLand = this.getBlock(node, dir.x, -2, dir.z)
    // @ts-ignore
    while (blockLand.position && blockLand.position.y > this.bot.game.minY) {
      if (blockLand.liquid && blockLand.safe) return blockLand
      if (blockLand.physical) {
        if (node.y - blockLand.position.y <= this.maxDropDown) return this.getBlock(blockLand.position, 0, 1, 0)
        return null
      }
      if (!blockLand.safe) return null
      blockLand = this.getBlock(blockLand.position, 0, -1, 0)
    }
    return null
  }

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveDropDown(node, dir, neighbors) {
    const blockHeadAfter = this.getBlock(node, dir.x, 1, dir.z)
    const blockFootAfter = this.getBlock(node, dir.x, 0, dir.z)
    const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)

    let cost = 1 // move cost
    /**
     * @type {Array<Vec3>}
     */
    const toBreak = []
    /**
     * @type {Array<import('./move').ToPlace>}
     */
    const toPlace = []

    const blockLand = this.getLandingBlock(node, dir)
    if (!blockLand) return
    if (!this.infiniteLiquidDropdownDistance && ((node.y - blockLand.position.y) > this.maxDropDown)) return // Don't drop down into water
    cost += this.landingCost(node, this.getBlock(blockLand.position, 0, -1, 0))
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockHeadAfter, toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockFootAfter, toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockGroundAfter, toBreak)
    if (cost === Infinity) return

    if (blockFootAfter.liquid) return // dont go underwater

    cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities

    neighbors.push(new Move(blockLand.position.x, blockLand.position.y, blockLand.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  /**
   * @param {Node} node
   * @param {Array<Move>} neighbors
   */
  getMoveDown(node, neighbors) {
    const blockGround = this.getBlock(node, 0, -1, 0)

    let cost = 1 // move cost
    /**
     * @type {Array<Vec3>}
     */
    const toBreak = []
    /**
     * @type {Array<import('./move').ToPlace>}
     */
    const toPlace = []

    const blockLand = this.getLandingBlock(node, { x: 0, z: 0 })
    if (!blockLand) return

    cost += this.landingCost(node, this.getBlock(blockLand.position, 0, -1, 0))
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockGround, toBreak)
    if (cost === Infinity) return

    if (this.getBlock(node, 0, 0, 0).liquid) return // dont go underwater

    cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities

    neighbors.push(new Move(blockLand.position.x, blockLand.position.y, blockLand.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  /**
   * @param {Node} node
   * @param {Array<Move>} neighbors
   */
  getMoveUp(node, neighbors) {
    const blockFoot = this.getBlock(node, 0, 0, 0)
    if (blockFoot.liquid) return
    if (this.getNumEntitiesAt(node, 0, 0, 0) > 0) return // an entity (besides the player) is blocking the building area

    const blockAbove = this.getBlock(node, 0, 2, 0)

    let cost = 1 // move cost
    /**
     * @type {Array<Vec3>}
     */
    const toBreak = []
    /**
     * @type {Array<import('./move').ToPlace>}
     */
    const toPlace = []
    cost += this.safeOrBreak(blockAbove, toBreak)
    if (cost === Infinity) return

    if (!blockFoot.climbable) {
      if (!this.allow1by1towers || node.remainingBlocks === 0) return // not enough blocks to place

      if (!blockFoot.replaceable) {
        if (!this.safeToBreak(blockFoot)) return
        toBreak.push(blockFoot.position)
      }

      const blockGround = this.getBlock(node, 0, -1, 0)
      if (blockGround.physical && blockGround.height - node.y < -0.2) return // cannot jump-place from a half block

      cost += this.exclusionPlace(blockFoot)
      toPlace.push({ x: node.x, y: node.y - 1, z: node.z, dx: 0, dy: 1, dz: 0, jump: true })
      cost += this.placeCost // additional cost for placing a block
    }

    if (cost === Infinity) return

    neighbors.push(new Move(node.x, node.y + 1, node.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace))
  }

  /**
   * Jump up, down or forward over a 1 block gap
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveParkourForward(node, dir, neighbors) {
    const blockGround = this.getBlock(node, 0, -1, 0)
    {
      const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)
      if ((blockGroundAfter.physical && blockGroundAfter.height >= blockGround.height) ||
         !this.getBlock(node, dir.x, 0, dir.z).safe ||
         !this.getBlock(node, dir.x, 1, dir.z).safe) return
      if (this.getBlock(node, 0, 0, 0).liquid) return // cant jump from water
    }

    let cost = 1

    // Leaving entities at the ceiling level (along path) out for now because there are few cases where that will be important
    cost += this.getNumEntitiesAt(node, dir.x, 0, dir.z) * this.entityCost

    // If we have a block on the ceiling, we cannot jump but we can still fall
    let ceilingClear = this.getBlock(node, 0, 2, 0).safe && this.getBlock(node, dir.x, 2, dir.z).safe

    // Similarly for the down path
    let floorCleared = !this.getBlock(node, dir.x, -2, dir.z).physical

    const maxD = this.allowSprinting ? 4 : 2

    for (let d = 2; d <= maxD; d++) {
      const dx = dir.x * d
      const dz = dir.z * d
      const blockAboveAfter = this.getBlock(node, dx, 2, dz)
      const blockHeadAfter = this.getBlock(node, dx, 1, dz)
      const blockFootAfter = this.getBlock(node, dx, 0, dz)
      const blockGroundAfter = this.getBlock(node, dx, -1, dz)

      if (blockFootAfter.safe) {
        cost += this.getNumEntitiesAt(blockFootAfter.position, 0, 0, 0) * this.entityCost
      }

      if (ceilingClear && blockHeadAfter.safe && blockFootAfter.safe && blockGroundAfter.physical) {
        cost += this.exclusionStep(blockHeadAfter)
        cost += this.landingCost(node, blockGroundAfter)
        // Forward
        neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks, cost, [], [], true))
        break
      } else if (ceilingClear && blockHeadAfter.safe && blockFootAfter.physical) {
        // Up
        if (blockAboveAfter.safe && d !== 4) { // 4 Blocks forward 1 block up is very difficult and fails often
          cost += this.exclusionStep(blockHeadAfter)
          cost += this.landingCost(node, blockFootAfter)
          if (blockFootAfter.height - blockGround.height > 1.2) break // Too high to jump
          cost += this.getNumEntitiesAt(blockHeadAfter.position, 0, 0, 0) * this.entityCost
          neighbors.push(new Move(blockHeadAfter.position.x, blockHeadAfter.position.y, blockHeadAfter.position.z, node.remainingBlocks, cost, [], [], true))
          break
        }
      } else if ((ceilingClear || d === 2) && blockHeadAfter.safe && blockFootAfter.safe && blockGroundAfter.safe && floorCleared) {
        // Down
        const blockBelowGroundAfter = this.getBlock(node, dx, -2, dz)
        if (blockBelowGroundAfter.physical) {
          cost += this.exclusionStep(blockGroundAfter)
          cost += this.landingCost(node, blockBelowGroundAfter)
          cost += this.getNumEntitiesAt(blockGroundAfter.position, 0, 0, 0) * this.entityCost
          neighbors.push(new Move(blockGroundAfter.position.x, blockGroundAfter.position.y, blockGroundAfter.position.z, node.remainingBlocks, cost, [], [], true))
        }
        floorCleared = floorCleared && !blockBelowGroundAfter.physical
      } else if (!blockHeadAfter.safe || !blockFootAfter.safe) {
        break
      }

      ceilingClear = ceilingClear && blockAboveAfter.safe
    }
  }

  // for each cardinal direction:
  // "." is head. "+" is feet and current location.
  // "#" is initial floor which is always solid. "a"-"u" are blocks to check
  //
  //   --0123-- horizontalOffset
  //  |
  // +2  aho
  // +1  .bip
  //  0  +cjq
  // -1  #dkr
  // -2   els
  // -3   fmt
  // -4   gn
  //  |
  //  dy

  /**
   * @param {Node} node
   * @returns {Array<Move>}
   */
  getNeighbors(node) {
    /**
     * @type {Array<Move>}
     */
    const neighbors = []

    // Simple moves in 4 cardinal points
    for (const i in cardinalDirections) {
      const dir = cardinalDirections[i]
      this.getMoveForward(node, dir, neighbors)
      this.getMoveJumpUp(node, dir, neighbors)
      this.getMoveDropDown(node, dir, neighbors)
      if (this.allowParkour) {
        this.getMoveParkourForward(node, dir, neighbors)
      }
    }

    // Diagonals
    for (const i in diagonalDirections) {
      this.getMoveDiagonal(node, diagonalDirections[i], neighbors)
    }

    this.getMoveDown(node, neighbors)
    this.getMoveUp(node, neighbors)

    return neighbors
  }
}

module.exports = Movements
