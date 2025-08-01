const { Vec3 } = require('vec3')
const nbt = require('prismarine-nbt')
const PrismarineBlock = require('prismarine-block')
const Move = require('./move')

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

class Movements {

  /** @readonly @type {import('mineflayer').Bot} */ bot
  /** @type {boolean} */ canDig
  /** Causes issues. Probably due to none paper servers. @type {boolean} */ canOpenDoors
  /** @type {() => boolean} */ sneak
  /** @type {boolean} */ dontCreateFlow
  /** @type {boolean} */ dontMineUnderFallingBlock
  /** @type {boolean} */ allow1by1towers
  /** @type {boolean} */ allowFreeMotion
  /** @type {boolean} */ allowParkour
  /** @type {boolean} */ allowSprinting

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
    * @type {Array<(block: import('..').SafeBlock) => number>}
    */
  exclusionAreasStep

  /**
   * Exclusion area for blocks to break. Works in the same way as {@link exclusionAreasStep} does. 
   * @type {Array<(block: import('..').SafeBlock) => number>}
   */
  exclusionAreasBreak

  /**
   * Exclusion area for placing blocks. Note only works for positions not block values as placed blocks are determined by the bots inventory content. Works in the same way as {@link exclusionAreasStep} does. 
   * @type {Array<(block: import('..').SafeBlock) => number>}
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
   * @param {Movements} [other]
   */
  constructor (bot, other = null) {
    const registry = bot.registry
    this.bot = bot
    // @ts-ignore
    const Block = PrismarineBlock(registry)
    this.Block = Block

    if (other) {
      this.canDig = other.canDig
      this.sneak = other.sneak
      this.digCost = other.digCost
      this.placeCost = other.placeCost
      this.liquidCost = other.liquidCost
      this.entityCost = other.entityCost

      this.dontCreateFlow = other.dontCreateFlow
      this.dontMineUnderFallingBlock = other.dontMineUnderFallingBlock
      this.allow1by1towers = other.allow1by1towers
      this.allowFreeMotion = other.allowFreeMotion
      this.allowParkour = other.allowParkour
      this.allowSprinting = other.allowSprinting
      this.allowEntityDetection = other.allowEntityDetection

      this.entitiesToAvoid = other.entitiesToAvoid
      this.passableEntities = other.passableEntities
      this.interactableBlocks = other.interactableBlocks
      this.blocksCantBreak = other.blocksCantBreak
      this.blocksCanBreakAnyway = other.blocksCanBreakAnyway
      this.blocksToAvoid = other.blocksToAvoid
      this.liquids = other.liquids
      this.gravityBlocks = other.gravityBlocks
      this.climbables = other.climbables
      this.emptyBlocks = other.emptyBlocks
      this.replaceables = other.replaceables
      this.scafoldingBlocks = other.scafoldingBlocks
      this.fences = other.fences
      this.carpets = other.carpets
      this.openable = other.openable
      this.canOpenDoors = other.canOpenDoors

      this.exclusionAreasStep = other.exclusionAreasStep
      this.exclusionAreasBreak = other.exclusionAreasBreak
      this.exclusionAreasPlace = other.exclusionAreasPlace

      this.maxDropDown = other.maxDropDown
      this.infiniteLiquidDropdownDistance = other.infiniteLiquidDropdownDistance

      this.entityIntersections = {}
      return
    }

    this.canDig = true
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
    this.blocksCantBreak.add(registry.blocksByName['chest'].id)

    this.blocksCanBreakAnyway = new Set()

    registry.blocksArray.forEach((/** @type {import('minecraft-data').Block} */ block) => {
      if (block.diggable) return
      this.blocksCantBreak.add(block.id)
    })

    this.blocksToAvoid = new Set()
    // this.blocksToAvoid.add(registry.blocksByName['fire'].id)
    if (registry.blocksByName['cobweb']) this.blocksToAvoid.add(registry.blocksByName['cobweb'].id)
    if (registry.blocksByName['web']) this.blocksToAvoid.add(registry.blocksByName['web'].id)
    this.blocksToAvoid.add(registry.blocksByName['lava'].id)

    this.liquids = new Set()
    this.liquids.add(registry.blocksByName['water'].id)
    this.liquids.add(registry.blocksByName['lava'].id)

    this.gravityBlocks = new Set()
    this.gravityBlocks.add(registry.blocksByName['sand'].id)
    this.gravityBlocks.add(registry.blocksByName['gravel'].id)

    this.climbables = new Set()
    this.climbables.add(registry.blocksByName['ladder'].id)
    // this.climbables.add(registry.blocksByName['vine'].id)
    this.emptyBlocks = new Set()

    this.replaceables = new Set()
    this.replaceables.add(registry.blocksByName['air'].id)
    if (registry.blocksByName['cave_air']) this.replaceables.add(registry.blocksByName['cave_air'].id)
    if (registry.blocksByName['void_air']) this.replaceables.add(registry.blocksByName['void_air'].id)
    this.replaceables.add(registry.blocksByName['water'].id)
    this.replaceables.add(registry.blocksByName['lava'].id)

    this.scafoldingBlocks = []
    this.scafoldingBlocks.push(registry.itemsByName['dirt'].id)
    this.scafoldingBlocks.push(registry.itemsByName['cobblestone'].id)

    this.fences = new Set()
    this.carpets = new Set()
    this.openable = new Set([
      registry.blocksByName['oak_door'].id,
      registry.blocksByName['spruce_door'].id,
      registry.blocksByName['birch_door'].id,
      registry.blocksByName['jungle_door'].id,
      registry.blocksByName['acacia_door'].id,
      registry.blocksByName['dark_oak_door'].id,
      registry.blocksByName['mangrove_door'].id,
      registry.blocksByName['cherry_door'].id,
      registry.blocksByName['bamboo_door'].id,
      registry.blocksByName['crimson_door'].id,
      registry.blocksByName['warped_door'].id,

      registry.blocksByName['oak_fence_gate'].id,
      registry.blocksByName['spruce_fence_gate'].id,
      registry.blocksByName['birch_fence_gate'].id,
      registry.blocksByName['jungle_fence_gate'].id,
      registry.blocksByName['acacia_fence_gate'].id,
      registry.blocksByName['dark_oak_fence_gate'].id,
      registry.blocksByName['mangrove_fence_gate'].id,
      registry.blocksByName['cherry_fence_gate'].id,
      registry.blocksByName['bamboo_fence_gate'].id,
      registry.blocksByName['crimson_fence_gate'].id,
      registry.blocksByName['warped_fence_gate'].id,

      // registry.blocksByName['oak_trapdoor'].id,
      // registry.blocksByName['spruce_trapdoor'].id,
      // registry.blocksByName['birch_trapdoor'].id,
      // registry.blocksByName['jungle_trapdoor'].id,
      // registry.blocksByName['acacia_trapdoor'].id,
      // registry.blocksByName['dark_oak_trapdoor'].id,
      // registry.blocksByName['mangrove_trapdoor'].id,
      // registry.blocksByName['cherry_trapdoor'].id,
      // registry.blocksByName['bamboo_trapdoor'].id,
      // registry.blocksByName['crimson_trapdoor'].id,
      // registry.blocksByName['warped_trapdoor'].id,
    ])
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

    this.canOpenDoors = false // Causes issues. Probably due to none paper servers.

    this.exclusionAreasStep = []
    this.exclusionAreasBreak = []
    this.exclusionAreasPlace = []

    this.maxDropDown = 4
    this.infiniteLiquidDropdownDistance = true

    this.entityIntersections = {}
  }

  //#region Utility Functions

  /**
   * @param {VecXYZ} node
   */
  dangerCost (node) {
    const a = this.getBlock(node, 0, 0, 0)

    const a0 = this.getBlock(node, -1, 0, 0)
    const b0 = this.getBlock(node, 1, 0, 0)
    const c0 = this.getBlock(node, 0, 0, -1)
    const d0 = this.getBlock(node, 0, 0, 1)

    const a1 = this.getBlock(node, -1, -1, 0)
    const b1 = this.getBlock(node, 1, -1, 0)
    const c1 = this.getBlock(node, 0, -1, -1)
    const d1 = this.getBlock(node, 0, -1, 1)
    const e1 = this.getBlock(node, 0, -1, 0)

    let cost = 0

    if (a.name === 'fire') { cost += 30 }
    if (a.name === 'campfire') { cost += 20 }
    if (e1.name === 'campfire') { cost += 20 }

    if (a0.name === 'campfire') { cost += 2 }
    if (b0.name === 'campfire') { cost += 2 }
    if (c0.name === 'campfire') { cost += 2 }
    if (d0.name === 'campfire') { cost += 2 }

    if (a0.name === 'cobweb') { cost += 1 }
    if (b0.name === 'cobweb') { cost += 1 }
    if (c0.name === 'cobweb') { cost += 1 }
    if (d0.name === 'cobweb') { cost += 1 }

    if (a0.name === 'fire') { cost += 10 }
    if (b0.name === 'fire') { cost += 10 }
    if (c0.name === 'fire') { cost += 10 }
    if (d0.name === 'fire') { cost += 10 }

    if (a1.name === 'water') { cost += 2 }
    if (b1.name === 'water') { cost += 2 }
    if (c1.name === 'water') { cost += 2 }
    if (d1.name === 'water') { cost += 2 }

    if (a1.name === 'fire') { cost += 10 }
    if (b1.name === 'fire') { cost += 10 }
    if (c1.name === 'fire') { cost += 10 }
    if (d1.name === 'fire') { cost += 10 }

    if (a1.name === 'lava') { cost += 50 }
    if (b1.name === 'lava') { cost += 50 }
    if (c1.name === 'lava') { cost += 50 }
    if (d1.name === 'lava') { cost += 50 }

    // const a2 = this.getBlock(node, -1, -2, 0)
    // const b2 = this.getBlock(node, 1, -2, 0)
    // const c2 = this.getBlock(node, 0, -2, -1)
    // const d2 = this.getBlock(node, 0, -2, 1)

    // if (a0.name === 'air' && a1.name === 'air' && a2.name === 'air') { cost += 0.01 }
    // if (b0.name === 'air' && b1.name === 'air' && b2.name === 'air') { cost += 0.01 }
    // if (c0.name === 'air' && c1.name === 'air' && c2.name === 'air') { cost += 0.01 }
    // if (d0.name === 'air' && d1.name === 'air' && d2.name === 'air') { cost += 0.01 }

    return cost
  }

  /**
   * @param {import('..').SafeBlock} block
   */
  exclusionPlace (block) {
    if (this.exclusionAreasPlace.length === 0) return 0
    let weight = 0
    for (const a of this.exclusionAreasPlace) {
      weight += a(block)
    }
    return weight
  }

  /**
   * @param {import('..').SafeBlock} block
   */
  exclusionStep (block) {
    if (this.exclusionAreasStep.length === 0) return 0
    let weight = 0
    for (const a of this.exclusionAreasStep) {
      weight += a(block)
    }
    return weight
  }

  /**
   * @param {Node} node
   * @param {import('..').SafeBlock} block
   */
  landingCost (node, block) {
    // const height = node.y - block.position.y
    if (block.name === 'farmland') {
      return 100
    }
    return 0
  }

  /**
   * @param {import('..').SafeBlock} block
   */
  exclusionBreak (block) {
    if (this.exclusionAreasBreak.length === 0) return 0
    let weight = 0
    for (const a of this.exclusionAreasBreak) {
      weight += a(block)
    }
    return weight
  }

  countScaffoldingItems () {
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

  getScaffoldingItem () {
    const items = this.bot.inventory.items()
    for (const id of this.scafoldingBlocks) {
      for (const j in items) {
        const item = items[j]
        if (item.type === id) return item
      }
    }
    return null
  }

  clearCollisionIndex () {
    this.entityIntersections = {}
  }

  /**
   * Finds blocks intersected by entity bounding boxes
   * and sets the number of ents intersecting in a dict.
   * Ignores entities that do not affect block placement
   */
  updateCollisionIndex () {
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
   * @param {VecXYZ} pos node position
   * @param {number} dx X axis offset
   * @param {number} dy Y axis offset
   * @param {number} dz Z axis offset
   * @returns {number} Number of entities intersecting block
   */
  getNumEntitiesAt (pos, dx, dy, dz) {
    if (this.allowEntityDetection === false) return 0
    if (!pos) return 0
    const y = pos.y + dy
    const x = pos.x + dx
    const z = pos.z + dz

    return this.entityIntersections[`${x},${y},${z}`] ?? 0
  }

  /**
   * @param {VecXYZ} pos
   * @param {number} dx
   * @param {number} dy
   * @param {number} dz
   * @returns {import('..').SafeBlock}
   */
  getBlock (pos, dx, dy, dz) {
    const p = new Vec3(pos.x + dx, pos.y + dy, pos.z + dz).floor()
    const stateId = this.bot.blocks.stateIdAt(p)
    const block = p ? this.bot.registry.blocksByStateId[stateId] : null
    if (!block) {
      // @ts-ignore
      return {
        height: dy,
        position: p,
      }
    }

    /** @type {import('..').SafeBlock} */ //@ts-ignore
    const b = {
      stateId: stateId,
      name: block.name,
      id: block.id,
      position: p,
      height: pos.y + dy,
      climbable: this.climbables.has(block.id),
      safe: false,
      physical:
        block.boundingBox === 'block' &&
        !this.fences.has(block.id) &&
        !this.emptyBlocks.has(block.id) &&
        block.name !== 'composter' &&
        block.name !== 'cauldron' &&
        block.name !== 'water_cauldron' &&
        block.name !== 'lava_cauldron' &&
        block.name !== 'powder_snow_cauldron',
      replaceable: false,
      liquid: this.liquids.has(block.id),
      canFall: this.gravityBlocks.has(block.id),
      openable: this.openable.has(block.id),
      canWalkOn: false,
      canJumpFrom: false,
    }

    b.safe = (this.emptyBlocks.has(block.id) || block.boundingBox === 'empty' || b.climbable || this.carpets.has(block.id)) && !this.blocksToAvoid.has(block.id)
    b.replaceable = this.replaceables.has(block.id) && !b.physical
    b.canWalkOn = b.physical
    b.canJumpFrom = true

    if (b.liquid) {
      b.canJumpFrom = false
    }

    if (b.name === 'powder_snow') {
      const hasBoots = (this.bot.inventory.slots[this.bot.getEquipmentDestSlot('feet')]?.name === 'leather_boots')
      b.canWalkOn = hasBoots
      b.canJumpFrom = hasBoots
    }

    for (const shape of this.bot.blocks.shapes(block)) {
      b.height = Math.max(b.height, pos.y + dy + shape[4])
    }

    return b
  }

  /**
   * Takes into account if the block is within a break exclusion area.
   * @param {import('..').SafeBlock} block
   * @returns {boolean}
   */
  safeToBreak (block) {
    if (!this.canDig && !this.blocksCanBreakAnyway.has(block.id)) {
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

    return block.id && !this.blocksCantBreak.has(block.id) && this.exclusionBreak(block) < Infinity
  }

  /**
   * Takes into account if the block is within the stepExclusionAreas. And returns Infinity if a block to be broken is within break exclusion areas.
   * @param {import('..').SafeBlock} block
   * @param {Array<import('./move').ToBreak>} toBreak
   * @returns {number}
   */
  safeOrBreak (block, toBreak) {
    let cost = 0
    cost += this.exclusionStep(block) // Is excluded so can't move or break
    cost += this.getNumEntitiesAt(block.position, 0, 0, 0) * this.entityCost
    if (block.liquid) cost += this.liquidCost
    if (block.safe) return cost
    if (!this.safeToBreak(block)) return Infinity // Can't break, so can't move
    toBreak.push(block.position)

    if (block.physical) {
      cost += this.getNumEntitiesAt(block.position, 0, 1, 0) * this.entityCost // Add entity cost if there is an entity above (a breakable block) that will fall
    }

    const b = this.Block.fromStateId(block.stateId, this.bot.blocks.biomeAt(block.position))

    const tool = this.bot.pathfinder.bestHarvestTool(b)
    const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : []
    const effects = this.bot.entity.effects
    const digTime = b.digTime(tool ? tool.type : null, false, false, false, enchants, effects)
    const laborCost = (1 + 3 * digTime / 1000) * this.digCost
    cost += laborCost
    return cost
  }

  /**
   * @param {VecXYZ} node
   * @param {VecXZ} dir
   */
  getLandingBlock (node, dir) {
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

  //#endregion

  //#region Movements

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveJumpUp (node, dir, neighbors) {
    const blockGround = this.getBlock(node, 0, -1, 0)
    const blockFoot = this.getBlock(node, 0, 0, 0)
    const blockAboveHead = this.getBlock(node, 0, 2, 0)
    const blockHeadAfter = this.getBlock(node, dir.x, 2, dir.z)
    const blockFootAfter = this.getBlock(node, dir.x, 1, dir.z)
    const blockGroundAfter = this.getBlock(node, dir.x, 0, dir.z)
    const blockBelowGroundAfter = this.getBlock(node, dir.x, -1, dir.z)

    if (!blockFoot.canJumpFrom) return

    let cost = 2 // move cost (move+jump)
    const toBreak = []
    const toPlace = []

    if (doors.includes(blockGroundAfter.name)) { return }

    if (blockAboveHead.physical && (this.getNumEntitiesAt(blockAboveHead.position, 0, 1, 0) > 0)) return // Blocks A, B and H are above C, D and the player's space, we need to make sure there are no entities that will fall down onto our building space if we break them
    if (blockHeadAfter.physical && (this.getNumEntitiesAt(blockHeadAfter.position, 0, 1, 0) > 0)) return
    if (blockFootAfter.physical && !blockHeadAfter.physical && !blockGroundAfter.physical && (this.getNumEntitiesAt(blockFootAfter.position, 0, 1, 0) > 0)) return // It is fine if an ent falls on B so long as we don't need to replace block C

    const isCarpetFence = (
      this.fences.has(blockGroundAfter.id) &&
      this.carpets.has(blockFootAfter.id)
    )

    if (!isCarpetFence && !blockGroundAfter.physical && blockGroundAfter.name !== 'end_portal') {
      if (node.remainingBlocks === 0) return // not enough blocks to place

      if (this.getNumEntitiesAt(blockGroundAfter.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

      if (!blockBelowGroundAfter.physical) {
        if (node.remainingBlocks === 1) return // not enough blocks to place

        if (this.getNumEntitiesAt(blockBelowGroundAfter.position, 0, 0, 0) > 0) return // Check for any entities in the way of a block placement

        if (!blockBelowGroundAfter.replaceable) {
          if (!this.safeToBreak(blockBelowGroundAfter)) return
          cost += this.exclusionBreak(blockBelowGroundAfter)
          toBreak.push(blockBelowGroundAfter.position)
        }
        cost += this.exclusionPlace(blockBelowGroundAfter)
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
      if (blockGroundAfter.position.y - blockGround.position.y <= 1 &&
        blockGroundAfter.physical && blockGround.liquid) {

      } else if (blockGroundAfter.height - blockGround.height > 1.2 && blockGround.name !== 'air') {
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

    cost += this.dangerCost(blockFootAfter.position)
    if (cost === Infinity) return

    if (blockGroundAfter.liquid) cost += this.liquidCost
    if (cost === Infinity) return

    neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace, true, 'jump-up', 'no'))
  }

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveForward (node, dir, neighbors) {
    const blockHeadAfter = this.getBlock(node, dir.x, 1, dir.z)
    const blockFootAfter = this.getBlock(node, dir.x, 0, dir.z)
    const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)

    let cost = 1 // move cost
    cost += this.exclusionStep(blockFootAfter)

    /** @type {Array<import('./move').ToBreak>} */ const toBreak = []
    /** @type {Array<import('./move').ToPlace>} */ const toPlace = []

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
    } else {
      if (!blockGroundAfter.canWalkOn) { return }
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
      if (cost === Infinity) return

      cost += this.safeOrBreak(blockHeadAfter, toBreak)
      if (cost === Infinity) return
    }

    if (this.getBlock(node, 0, 0, 0).liquid) cost += this.liquidCost
    if (cost === Infinity) return

    if (blockGroundAfter.liquid) cost += this.liquidCost
    if (cost === Infinity) return

    cost += this.dangerCost(blockFootAfter.position)
    if (cost === Infinity) return

    neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace, false, 'forward', 'optional'))
  }

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveDiagonal (node, dir, neighbors) {
    let cost = Math.SQRT2 // move cost
    /** @type {Array<import('./move').ToBreak>} */ const toBreak = []

    const blockFootAfter = this.getBlock(node, dir.x, 0, dir.z) // Landing block or standing on block when jumping up by 1
    const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)
    const y = blockFootAfter.canWalkOn ? 1 : 0

    const blockGround = this.getBlock(node, 0, -1, 0)

    if (!y) {
      const blockFoot1During = this.getBlock(node, dir.x, 0, 0)
      const blockFoot2During = this.getBlock(node, 0, 0, dir.z)
      const blockHead1During = this.getBlock(node, dir.x, 1, 0)
      const blockHead2During = this.getBlock(node, 0, 1, dir.z)
      if (blockFoot1During.physical || blockFoot2During.physical ||
        blockHead1During.physical || blockHead2During.physical) {
        //return
      }
    }

    let cost1 = 0
    /** @type {Array<import('./move').ToBreak>} */ const toBreak1 = []

    {
      const blockHeadAfter1 = this.getBlock(node, 0, y + 1, dir.z)
      const blockFootAfter1 = this.getBlock(node, 0, y, dir.z)
      const blockGroundAfter1 = this.getBlock(node, 0, y - 1, dir.z)
      cost1 += this.safeOrBreak(blockHeadAfter1, toBreak1)
      cost1 += this.safeOrBreak(blockFootAfter1, toBreak1)
      if (blockGroundAfter1.height - blockGround.height > 1.2) cost1 += this.safeOrBreak(blockGroundAfter1, toBreak1)
    }

    let cost2 = 0
    /** @type {Array<import('./move').ToBreak>} */ const toBreak2 = []
    {
      const blockHeadAfter2 = this.getBlock(node, dir.x, y + 1, 0)
      const blockFootAfter2 = this.getBlock(node, dir.x, y, 0)
      const blockGroundAfter2 = this.getBlock(node, dir.x, y - 1, 0)
      cost2 += this.safeOrBreak(blockHeadAfter2, toBreak2)
      cost2 += this.safeOrBreak(blockFootAfter2, toBreak2)
      if (blockGroundAfter2.height - blockGround.height > 1.2) cost2 += this.safeOrBreak(blockGroundAfter2, toBreak2)
    }

    if (cost1 < cost2) {
      cost += cost1
      toBreak.push(...toBreak1)
    } else {
      cost += cost2
      toBreak.push(...toBreak2)
    }
    if (cost === Infinity) return

    cost += this.safeOrBreak(this.getBlock(node, dir.x, y, dir.z), toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(this.getBlock(node, dir.x, y + 1, dir.z), toBreak)
    if (cost === Infinity) return

    if (this.getBlock(node, 0, 0, 0).liquid) cost += this.liquidCost
    if (cost === Infinity) return

    if (this.getBlock(node, dir.x, y - 1, dir.z).liquid) cost += this.liquidCost
    if (cost === Infinity) return

    cost += this.dangerCost(blockFootAfter.position)
    if (cost === Infinity) return

    if (y === 1) {
      if (blockFootAfter.height - blockGround.height > 1.2) return
      cost += this.safeOrBreak(this.getBlock(node, 0, 2, 0), toBreak)
      if (cost === Infinity) return
      cost += 1
      neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y + 1, blockFootAfter.position.z, node.remainingBlocks, cost, toBreak, [], true, 'diagonal-up', 'no'))
    } else if (blockGroundAfter.canWalkOn || blockFootAfter.liquid) {
      neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks, cost, toBreak, [], false, 'diagonal', 'optional'))
    } else if (this.getBlock(node, dir.x, -2, dir.z).canWalkOn || blockGroundAfter.liquid) {
      if (!blockGroundAfter.safe) return // don't self-immolate
      cost += this.getNumEntitiesAt(blockFootAfter.position, 0, -1, 0) * this.entityCost
      neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y - 1, blockFootAfter.position.z, node.remainingBlocks, cost, toBreak, [], true, 'diagonal-down', 'no'))
    }
  }

  /**
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveDropDown (node, dir, neighbors) {
    const blockHeadAfter = this.getBlock(node, dir.x, 1, dir.z)
    const blockFootAfter = this.getBlock(node, dir.x, 0, dir.z)
    const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)

    let cost = 1 // move cost
    /** @type {Array<import('./move').ToBreak>} */ const toBreak = []
    /** @type {Array<import('./move').ToPlace>} */ const toPlace = []

    const blockLand = this.getLandingBlock(node, dir)
    if (!blockLand) return

    const dropdownHeight = node.y - blockLand.position.y

    if (!this.infiniteLiquidDropdownDistance && (dropdownHeight > this.maxDropDown)) return // Don't drop down into water
    cost += this.landingCost(node, this.getBlock(blockLand.position, 0, -1, 0))
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockHeadAfter, toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockFootAfter, toBreak)
    if (cost === Infinity) return
    cost += this.safeOrBreak(blockGroundAfter, toBreak)
    if (cost === Infinity) return

    if (blockFootAfter.liquid) return
    if (blockGroundAfter.liquid) return

    if (blockHeadAfter.liquid) cost += this.liquidCost
    if (cost === Infinity) return

    if (dropdownHeight <= 3 && blockLand.liquid) {
      cost += this.liquidCost
    }

    cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities
    if (cost === Infinity) return
    cost += this.dangerCost(blockLand.position)
    if (cost === Infinity) return

    neighbors.push(new Move(blockLand.position.x, blockLand.position.y, blockLand.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace, true, 'drop-down', 'no'))
  }

  /**
   * @param {Node} node
   * @param {Array<Move>} neighbors
   */
  getMoveDown (node, neighbors) {
    const blockGround = this.getBlock(node, 0, -1, 0)

    let cost = 1 // move cost
    /** @type {Array<import('./move').ToBreak>} */ const toBreak = []
    /** @type {Array<import('./move').ToPlace>} */ const toPlace = []

    const blockLand = this.getLandingBlock(node, { x: 0, z: 0 })
    if (!blockLand) return

    cost += this.landingCost(node, this.getBlock(blockLand.position, 0, -1, 0))
    if (cost === Infinity) return

    cost += this.safeOrBreak(blockGround, toBreak)
    if (cost === Infinity) return

    if (this.getBlock(node, 0, 0, 0).liquid) return
    if (this.getBlock(node, 0, -1, 0).liquid) return

    cost += this.getNumEntitiesAt(blockLand.position, 0, 0, 0) * this.entityCost // add cost for entities
    if (cost === Infinity) return

    neighbors.push(new Move(blockLand.position.x, blockLand.position.y, blockLand.position.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace, true, 'down', 'no'))
  }

  /**
   * @param {Node} node
   * @param {Array<Move>} neighbors
   */
  getMoveUp (node, neighbors) {
    const blockFoot = this.getBlock(node, 0, 0, 0)
    const blockHead = this.getBlock(node, 0, 1, 0)
    const blockAbove = this.getBlock(node, 0, 2, 0)
    if (blockFoot.liquid || blockHead.liquid) {
      if (blockAbove.safe) {
        neighbors.push(new Move(node.x, node.y + 1, node.z, node.remainingBlocks, 1, [], [], true, 'up', 'no'))
      }
      return
    }
    if (this.getNumEntitiesAt(node, 0, 0, 0) > 0) return // an entity (besides the player) is blocking the building area

    let cost = 1 // move cost
    /** @type {Array<import('./move').ToBreak>} */ const toBreak = []
    /** @type {Array<import('./move').ToPlace>} */ const toPlace = []
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

    neighbors.push(new Move(node.x, node.y + 1, node.z, node.remainingBlocks - toPlace.length, cost, toBreak, toPlace, true, 'up', 'no'))
  }

  // for each cardinal direction:
  // "." is head. "+" is feet and current location.
  // "#" is initial floor which is always solid. "a"-"u" are blocks to check
  //
  //   --0123------ dx
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
   * Jump up, down or forward over a 1 block gap
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   */
  getMoveParkourForward (node, dir, neighbors) {
    const blockGround = this.getBlock(node, 0, -1, 0)
    {
      const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)
      if ((blockGroundAfter.physical && blockGroundAfter.height >= blockGround.height) ||
        !this.getBlock(node, dir.x, 0, dir.z).safe ||
        !this.getBlock(node, dir.x, 1, dir.z).safe) return
    }

    if (!this.getBlock(node, 0, 0, 0).canJumpFrom) return // cant jump from water

    let cost = 1 + (Math.sqrt(dir.x * dir.x + dir.z * dir.z) * 0.1 /* time cost */ )

    // Leaving entities at the ceiling level (along path) out for now because there are few cases where that will be important
    cost += this.getNumEntitiesAt(node, dir.x, 0, dir.z) * this.entityCost

    // If we have a block on the ceiling, we cannot jump but we can still fall
    let ceilingClear = this.getBlock(node, 0, 2, 0).safe && this.getBlock(node, dir.x, 2, dir.z).safe

    // Similarly for the down path
    let floorCleared = !this.getBlock(node, dir.x, -2, dir.z).physical

    const maxD = 4

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

      if (ceilingClear && blockHeadAfter.safe && blockFootAfter.safe && blockGroundAfter.canWalkOn) {
        cost += this.exclusionStep(blockHeadAfter)
        cost += this.landingCost(node, blockGroundAfter)
        cost += this.dangerCost(blockFootAfter.position)
        // Forward
        neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks, cost, [], [], true, 'parkour', d > 3 ? 'yes' : 'no'))
        break
      } else if (ceilingClear && blockHeadAfter.safe && blockFootAfter.canWalkOn) {
        // Up
        if (blockAboveAfter.safe && d !== 4) { // 4 Blocks forward 1 block up is very difficult and fails often
          cost += this.exclusionStep(blockHeadAfter)
          cost += this.landingCost(node, blockFootAfter)
          if (blockFootAfter.height - blockGround.height > 1.2) break // Too high to jump
          cost += this.getNumEntitiesAt(blockHeadAfter.position, 0, 0, 0) * this.entityCost
          cost += this.dangerCost(blockHeadAfter.position)
          neighbors.push(new Move(blockHeadAfter.position.x, blockHeadAfter.position.y, blockHeadAfter.position.z, node.remainingBlocks, cost, [], [], true, 'parkour', d > 2 ? 'yes' : 'no'))
          break
        }
      } else if ((ceilingClear || d === 2) && blockHeadAfter.safe && blockFootAfter.safe && blockGroundAfter.safe && floorCleared) {
        // Down
        const blockGroundAfter2 = this.getBlock(node, dx, -2, dz)
        if (blockGroundAfter2.canWalkOn) {
          cost += this.exclusionStep(blockGroundAfter)
          cost += this.landingCost(node, blockGroundAfter2)
          cost += this.getNumEntitiesAt(blockGroundAfter.position, 0, 0, 0) * this.entityCost
          cost += this.dangerCost(blockGroundAfter.position)
          neighbors.push(new Move(blockGroundAfter.position.x, blockGroundAfter.position.y, blockGroundAfter.position.z, node.remainingBlocks, cost, [], [], true, 'parkour', d > 3 ? 'yes' : 'no'))
        }
        floorCleared = floorCleared && !blockGroundAfter2.physical
      } else if (!blockHeadAfter.safe || !blockFootAfter.safe) {
        break
      }

      ceilingClear = ceilingClear && blockAboveAfter.safe
    }
  }

  /**
   * Jump up, down or forward over a 1 block gap
   * @param {Node} node
   * @param {VecXZ} dir
   * @param {Array<Move>} neighbors
   * @param {ReadonlyArray<VecXZ>} touchingCells
   */
  getMoveParkourAny (node, dir, neighbors, touchingCells) {
    const blockGround = this.getBlock(node, 0, -1, 0)
    {
      const blockGroundAfter = this.getBlock(node, dir.x, -1, dir.z)
      if ((blockGroundAfter.physical && blockGroundAfter.height > blockGround.height) ||
        !this.getBlock(node, dir.x, 0, dir.z).safe ||
        !this.getBlock(node, dir.x, 1, dir.z).safe) return
    }

    if (!this.getBlock(node, 0, 0, 0).canJumpFrom) return // cant jump from water

    let cost = 1 + (Math.sqrt(dir.x * dir.x + dir.z * dir.z) * 0.1 /* time cost */ )

    // Leaving entities at the ceiling level (along path) out for now because there are few cases where that will be important
    cost += this.getNumEntitiesAt(node, dir.x, 0, dir.z) * this.entityCost

    // If we have a block on the ceiling, we cannot jump but we can still fall
    let ceilingClear = this.getBlock(node, 0, 2, 0).safe && this.getBlock(node, dir.x, 2, dir.z).safe

    // Similarly for the down path
    let floorCleared = !this.getBlock(node, dir.x, -2, dir.z).physical

    //if (dir.x === 1 && dir.z === 3 &&
    //    node.x === 128 && node.y === 84 && node.z === -33) { debugger }

    for (let i = 0; i < touchingCells.length; i++) {
      const dx = touchingCells[i].x
      const dz = touchingCells[i].z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d <= 1) continue

      const blockAboveAfter = this.getBlock(node, dx, 2, dz)
      const blockHeadAfter = this.getBlock(node, dx, 1, dz)
      const blockFootAfter = this.getBlock(node, dx, 0, dz)
      const blockGroundAfter = this.getBlock(node, dx, -1, dz)

      if (blockFootAfter.safe) {
        cost += this.getNumEntitiesAt(blockFootAfter.position, 0, 0, 0) * this.entityCost
      }

      if (ceilingClear && blockHeadAfter.safe && blockFootAfter.safe && blockGroundAfter.canWalkOn) {
        cost += this.exclusionStep(blockHeadAfter)
        cost += this.landingCost(node, blockGroundAfter)
        cost += this.dangerCost(blockFootAfter.position)
        // Forward
        neighbors.push(new Move(blockFootAfter.position.x, blockFootAfter.position.y, blockFootAfter.position.z, node.remainingBlocks, cost, [], [], true, 'parkour', d > 3 ? 'yes' : 'no'))
        break
      } else if (ceilingClear && blockHeadAfter.safe && blockFootAfter.canWalkOn) {
        // Up
        if (blockAboveAfter.safe && d < 4) { // 4 Blocks forward 1 block up is very difficult and fails often
          cost += this.exclusionStep(blockHeadAfter)
          cost += this.landingCost(node, blockFootAfter)
          if (blockFootAfter.height - blockGround.height > 1.2) break // Too high to jump
          cost += this.getNumEntitiesAt(blockHeadAfter.position, 0, 0, 0) * this.entityCost
          cost += this.dangerCost(blockHeadAfter.position)
          neighbors.push(new Move(blockHeadAfter.position.x, blockHeadAfter.position.y, blockHeadAfter.position.z, node.remainingBlocks, cost, [], [], true, 'parkour', d > 2 ? 'yes' : 'no'))
          break
        }
      } else if ((ceilingClear || d < 2) && blockHeadAfter.safe && blockFootAfter.safe && blockGroundAfter.safe && floorCleared) {
        // Down
        const blockGroundAfter2 = this.getBlock(node, dx, -2, dz)
        if (blockGroundAfter2.canWalkOn) {
          cost += this.exclusionStep(blockGroundAfter)
          cost += this.landingCost(node, blockGroundAfter2)
          cost += this.getNumEntitiesAt(blockGroundAfter.position, 0, 0, 0) * this.entityCost
          cost += this.dangerCost(blockGroundAfter.position)
          neighbors.push(new Move(blockGroundAfter.position.x, blockGroundAfter.position.y, blockGroundAfter.position.z, node.remainingBlocks, cost, [], [], true, 'parkour', d > 3 ? 'yes' : 'no'))
        }
        floorCleared = floorCleared && !blockGroundAfter2.physical
      } else if (!blockHeadAfter.safe || !blockFootAfter.safe) {
        break
      }

      ceilingClear = ceilingClear && blockAboveAfter.safe
    }
  }

  //#endregion

  /**
   * @param {VecXZ} delta
   * @returns {ReadonlyArray<VecXZ>}
   */
  static getTouchingCells(delta)
  {
    /** @type {Array<VecXZ>} */
    const cells = []

    const steps = Math.sqrt(delta.x * delta.x + delta.z * delta.z) * 100
    const step = { x: delta.x / steps, z: delta.z / steps }

    for (let i = 0; i <= steps; i++)
    {
      const pos = { x: step.x * i, z: step.z * i }

      const x0 = Math.floor(pos.x)
      const z0 = Math.floor(pos.z)
      const x1 = Math.floor(pos.x + 0.6)
      const z1 = Math.floor(pos.z + 0.6)

      for (let x = x0; x <= x1; x++)
      {
        for (let z = z0; z <= z1; z++)
        {
          if (!cells.some(v => v.x === x && v.z === z))
          {
            cells.push({ x, z })
          }
        }
      }
    }

    return cells
  }

  /** @type {ReadonlyArray<VecXZ & { touchingCells: ReadonlyArray<VecXZ> }>} */
  static PARKOUR_DIRECTIONS = (() => {
    /** @type {Array<VecXZ & { touchingCells: ReadonlyArray<VecXZ> }>} */
    const result = []

    for (let dx = -4; dx <= 4; dx++) {
      for (let dz = -4; dz <= 4; dz++) {
        if (!dx && !dz) continue
        const l = Math.sqrt(dx * dx + dz * dz)
        if (l <= 1) continue
        if (result.some(v => v.x === dx && v.z === dz)) continue
        result.push({ x: dx, z: dz, touchingCells: Movements.getTouchingCells({ x: dx, z: dz }) })
      }
    }

    return result
  })()

  /**
   * @param {Node} node
   * @returns {Array<Move>}
   */
  getNeighbors (node) {
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

    if (this.allowParkour) {
      for (const d of Movements.PARKOUR_DIRECTIONS) {
        this.getMoveParkourAny(node, new Vec3(d.x, 0, d.z), neighbors, d.touchingCells)
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
