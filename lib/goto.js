/**
 * @param {string} name
 * @param {string} message
 */
function error (name, message) {
  const err = new Error(message)
  err.name = name
  return err
}

/**
 * Adds a easy-to-use API wrapper for quickly executing a goal and running
 * a callback when that goal is reached. This function serves to remove a
 * lot of boilerplate code for quickly executing a goal.
 *
 * @param {import('mineflayer').Bot} bot - The bot.
 * @param {import('./goals').GoalBase} goal - The goal to execute.
 * @returns {Promise<void>} - resolves on success, rejects on error
 */
function goto (bot, goal) {
  return new Promise((resolve, reject) => {
    function goalReached () {
      cleanup()
    }

    /**
     * @param {import('..').PartiallyComputedPath} results
     */
    function noPathListener(results) {
      if (results.status === 'partial') {
        
      } else if (results.status === 'noPath') {
        cleanup(error('NoPath', 'No path to the goal!'))
      } else if (results.status === 'timeout') {
        cleanup(error('Timeout', 'Took to long to decide path to goal!'))
      } else if (results.path.length === 0) {
        cleanup()
      }
    }

    /**
     * @param {import('./goals').GoalBase} newGoal
     */
    function goalChangedListener (newGoal) {
      if (newGoal !== goal) {
        cleanup(error('GoalChanged', 'The goal was changed before it could be completed!'))
      }
    }

    function pathStopped () {
      cleanup(error('PathStopped', 'Path was stopped before it could be completed! Thus, the desired goal was not reached.'))
    }

    /**
     * @param {Error} [err]
     */
    function cleanup (err) {
      bot.removeListener('goal_reached', goalReached)
      bot.removeListener('path_update', noPathListener)
      bot.removeListener('goal_updated', goalChangedListener)
      bot.removeListener('path_stop', pathStopped)

      // Run callback on next event stack to let pathfinder properly cleanup,
      // otherwise chaining waypoints does not work properly.
      setTimeout(() => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }, 0)
    }

    bot.on('path_stop', pathStopped)
    bot.on('goal_reached', goalReached)
    bot.on('path_update', noPathListener)
    bot.on('goal_updated', goalChangedListener)
    bot.pathfinder.setGoal(goal)
  })
}

module.exports = goto
