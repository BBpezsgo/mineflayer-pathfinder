import { Bot } from 'mineflayer';
import { IndexedData } from 'minecraft-data';
import { Item } from 'prismarine-item';
import { Vec3 } from 'vec3';
import { Block } from 'prismarine-block';
import { Entity } from 'prismarine-entity';
import { World } from 'prismarine-world'
import AStar from './lib/astar';
import * as _Movements from './lib/movements';

declare module 'mineflayer-pathfinder' {
	export function pathfinder(bot: Bot): void;

	export interface Pathfinder {
		thinkTimeout: number;
		/** ms, amount of thinking per tick (max 50 ms) */
		tickTimeout: number;
		readonly goal: goals.Goal | null;
		readonly movements: Movements;

		searchRadius?: number;
		enablePathShortcut?: boolean;
		LOSWhenPlacingBlocks?: boolean;

		bestHarvestTool(block: Block): Item | null;
		getPathTo(
			movements: Movements,
			goal: goals.Goal,
			timeout?: number
		): ComputedPath;
		getPathFromTo(
			movements: Movements,
			startPos: Vec3, 
			goal: goals.Goal, 
			options?: {
				optimizePath?: boolean,
				resetEntityIntersects?: boolean,
				timeout?: number,
				tickTimeout?: number,
				searchRadius?: number,
				startMove?: Move
			}
		): IterableIterator<{ result: PartiallyComputedPath, astarContext: AStar }>

		setGoal(goal: goals.Goal | null, dynamic?: boolean): void;
		setMovements(movements: Movements): void;
		goto(goal: goals.Goal, callback?: (error?: Error) => void): Promise<void>;
		stop(): void;

		isMoving(): boolean;
		isMining(): boolean;
		isBuilding(): boolean;
	}

	export namespace goals {
		export abstract class Goal {
			public abstract heuristic(node: Move): number;
			public abstract isEnd(node: Move): boolean;
			public hasChanged(): boolean;
			public isValid(): boolean;
		}

		export class GoalBlock extends Goal {
			public constructor(x: number, y: number, z: number);

			public x: number;
			public y: number;
			public z: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalNear extends Goal {
			public constructor(x: number, y: number, z: number, range: number);

			public x: number;
			public y: number;
			public z: number;
			public rangeSq: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalXZ extends Goal {
			public constructor(x: number, z: number);

			public x: number;
			public z: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalNearXZ extends Goal {
			public constructor(x: number, z: number, range: number);

			public x: number;
			public z: number;
			public rangeSq: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalY extends Goal {
			public constructor(y: number);

			public y: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalGetToBlock extends Goal {
			public constructor(x: number, y: number, z: number);

			public x: number;
			public y: number;
			public z: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalCompositeAny<T extends Goal> extends Goal {
			public constructor(goals: T[] = []);
			public goals: T[];
			
			public push(goal: Goal): void;
			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalCompositeAll<T extends Goal> extends Goal {
			public constructor(goals: T[] = []);
			public goals: T[];

			public push(goal: Goal): void;
			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalInvert extends Goal {
			public constructor(goal: Goal);
			
			public goal: Goal;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalFollow extends Goal {
			public constructor(entity: Entity, range: number);

			public x: number;
			public y: number;
			public z: number;
			public entity: Entity;
			public rangeSq: number;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalPlaceBlock extends Goal {
			public options: {
				range: number;
				LOS: boolean;
				faces: [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
				facing: number;
				half: boolean;
			}
			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
			public constructor(pos: Vec3, world: World, options: GoalPlaceBlockOptions)
		}
		
		export class GoalLookAtBlock  extends Goal {
			public constructor(pos: Vec3, world: World, options?: { reach?: number, entityHeight?: number })
			
			public pos: Vec3;
			public reach: number;
			public entityHeight: number;
			public world: World;

			public heuristic(node: Move): number;
			public isEnd(node: Move): boolean;
			public hasChanged(): boolean;
		}

		export class GoalBreakBlock extends GoalLookAtBlock {}
	}

	export class Movements extends _Movements { }

	// this is a class, but its not exported so we use an interface
	export interface Move extends XYZCoordinates {
		remainingBlocks: number;
		cost: number;
		toBreak: Move[];
		toPlace: Move[];
		parkour: boolean;
		hash: string;
	}

	interface PathBase {
		cost: number;
		time: number;
		visitedNodes: number;
		generatedNodes: number;
		path: Array<Move>;
	}

	export interface ComputedPath extends PathBase {
		status: 'noPath' | 'timeout' | 'success';
	}

	export interface PartiallyComputedPath extends PathBase {
		status: 'noPath' | 'timeout' | 'success' | 'partial';
	}

	export interface XZCoordinates {
		x: number;
		z: number;
	}

	export interface XYZCoordinates extends XZCoordinates {
		y: number;
	}

	export interface SafeBlock extends Block {
		safe: boolean
		physical: boolean
		liquid: boolean
		height: number
		replaceable: boolean
		climbable: boolean
		openable: boolean
		canFall: boolean
	}

	export interface GoalPlaceBlockOptions {
		range: number;
		LOS: boolean;
		faces: Vec3[];
		facing: 'north' | 'east' | 'south' | 'west' | 'up' | 'down';
	}
}

declare module 'mineflayer' {
	interface BotEvents {
		goal_reached: (goal: Goal) => void;
		path_update: (path: PartiallyComputedPath) => void;
		goal_updated: (goal: Goal, dynamic: boolean) => void;
		path_reset: (
			reason: 'goal_updated' | 'movements_updated' |
				'block_updated' | 'chunk_loaded' | 'goal_moved' | 'dig_error' |
				'no_scaffolding_blocks' | 'place_error' | 'stuck'
		) => void;
		path_stop: () => void;
	}

	interface Bot {
		readonly pathfinder: Pathfinder
	}
}
