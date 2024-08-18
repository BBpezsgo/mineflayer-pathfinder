import { Pathfinder } from 'mineflayer-pathfinder'

declare module 'mineflayer' {
    interface Bot {
		readonly pathfinder: Pathfinder
    }
    
	interface BotEvents {
		goal_reached: (goal: import('./lib/goals').GoalBase) => void;
		path_update: (path: PartiallyComputedPath) => void;
		goal_updated: (goal: import('./lib/goals').GoalBase, dynamic: boolean) => void;
		path_reset: (
			reason: 'goal_updated' | 'movements_updated' |
				'block_updated' | 'chunk_loaded' | 'goal_moved' | 'dig_error' |
				'no_scaffolding_blocks' | 'place_error' | 'stuck'
		) => void;
		path_stop: () => void;
	}
}
