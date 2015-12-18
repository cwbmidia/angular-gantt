/*
Project: angular-gantt v1.2.9 - Gantt chart component for AngularJS
Authors: Marco Schweighauser, Rémi Alvergnat
License: MIT
Homepage: https://www.angular-gantt.com
Github: https://github.com/angular-gantt/angular-gantt.git
*/
(function(){
    'use strict';
    angular.module('gantt.dependencies', ['gantt', 'gantt.dependencies.templates']).directive('ganttDependencies', ['$timeout', '$document', 'ganttDebounce', 'GanttDependenciesManager', function($timeout, $document, debounce, DependenciesManager) {
        return {
            restrict: 'E',
            require: '^gantt',
            scope: {
                enabled: '=?'
                // Add other option attributes for this plugin
            },
            link: function(scope, element, attrs, ganttCtrl) {
                var api = ganttCtrl.gantt.api;

                // Load options from global options attribute.
                if (scope.options && typeof(scope.options.dependencies) === 'object') {
                    for (var option in scope.options.dependencies) {
                        scope[option] = scope.options[option];
                    }
                }

                if (scope.enabled === undefined) {
                    scope.enabled = true;
                }

                var manager = new DependenciesManager(ganttCtrl.gantt);

                api.directives.on.new(scope, function(directiveName, directiveScope, directiveElement) {
                    if (directiveName === 'ganttBody') {
                        manager.plumb.setContainer(directiveElement);
                    }
                });

                api.tasks.on.add(scope, function(task) {
                    var taskDependencies = task.model.dependencies;

                    if (taskDependencies !== undefined) {
                        var toId = taskDependencies.to;

                        if (toId !== undefined) {
                            manager.addDependency(task.model.id, toId);
                        }

                        var fromId = taskDependencies.from;
                        if (fromId !== undefined) {
                            manager.addDependency(fromId, task.model.id);
                        }
                    }
                });

                api.tasks.on.remove(scope, function(task) {
                    var dependencies = manager.getTaskDependencies(task);

                    if (dependencies) {
                        angular.forEach(dependencies, function(dependency) {
                            dependency.disconnect();
                            manager.removeDependency(dependency.fromId, dependency.toId);
                        });
                    }
                });

                api.tasks.on.displayed(scope, debounce(function(tasks, filteredTasks, visibleTasks) {
                    manager.setTasks(visibleTasks);
                    manager.refresh();
                }, 10));

                api.rows.on.displayed(scope, function() {
                    manager.refresh();
                });

                api.tasks.on.viewChange(scope, function(task) {
                    if (task.$element) {
                        manager.plumb.revalidate(task.$element[0]);
                    }
                });

                api.tasks.on.viewRowChange(scope, debounce(function(task) {
                    manager.setTask(task);
                }, 10));

            }
        };
    }]);
}());


/* globals jsPlumb */
(function() {
    'use strict';

    angular.module('gantt.dependencies').factory('GanttDependenciesManager', ['GanttDependency', function(Dependency) {
        var DependenciesManager = function(gantt) {
            var self = this;

            this.gantt = gantt;

            this.plumb = jsPlumb.getInstance();

            this.dependenciesFrom = {};
            this.dependenciesTo = {};

            this.tasks = {};

            /**
             * Add definition of a dependency.
             *
             * @param fromId id of the start task of the dependency
             * @param toId id of the end task of the dependency
             */
            this.addDependency = function(fromId, toId) {
                var dependency = new Dependency(this, fromId, toId);

                if (!(fromId in this.dependenciesFrom)) {
                    this.dependenciesFrom[fromId] = [];
                }
                if (!(toId in this.dependenciesTo)) {
                    this.dependenciesTo[toId] = [];
                }

                this.dependenciesFrom[fromId].push(dependency);
                this.dependenciesTo[toId].push(dependency);
            };

            /**
             * Check if a dependency definition exists.
             *
             * @param fromId id of the start task of the dependency
             * @param toId id of the end task of the dependency
             * @returns {boolean}
             */
            this.hasDependency = function(fromId, toId) {
                var fromDependencies = this.dependenciesFrom[fromId];

                if (!fromDependencies) {
                    return false;
                }

                var found = false;
                angular.forEach(fromDependencies, function(dependency) {
                    if (dependency.to === toId) {
                        found = true;
                    }
                });
                return found;
            };

            /**
             * Remove definition of a dependency
             *
             * @param fromId id of the start task of the dependency
             * @param toId id of the end task of the dependency
             */
            this.removeDependency = function(fromId, toId) {
                var fromDependencies = this.dependenciesFrom[fromId];
                var fromRemove = [];

                if (fromDependencies) {
                    angular.forEach(fromDependencies, function(dependency) {
                        if (dependency.to === toId) {
                            fromRemove.push(dependency);
                        }
                    });
                }

                var toDependencies = this.dependenciesTo[toId];
                var toRemove = [];

                if (toDependencies) {
                    angular.forEach(toDependencies, function(dependency) {
                        if (dependency.from === fromId) {
                            toRemove.push(dependency);
                        }
                    });
                }

                angular.forEach(fromRemove, function(dependency) {
                    dependency.disconnect();
                    fromDependencies.splice(fromDependencies.indexOf(dependency), 1);
                });

                angular.forEach(toRemove, function(dependency) {
                    dependency.disconnect();
                    toDependencies.splice(toDependencies.indexOf(dependency), 1);
                });
            };

            this.getTaskDependencies = function(task) {
                var dependencies = [];

                var fromDependencies = self.dependenciesFrom[task.model.id];
                if (fromDependencies) {
                    dependencies = dependencies.concat(fromDependencies);
                }

                var toDependencies = self.dependenciesTo[task.model.id];
                if (toDependencies) {
                    dependencies = dependencies.concat(toDependencies);
                }

                return dependencies;
            };

            /**
             * Set tasks objects that can be used to display dependencies.
             *
             * @param tasks
             */
            this.setTasks = function(tasks) {
                self.tasks = {};
                angular.forEach(tasks, function(task) {
                    self.tasks[task.model.id] = task;
                });
            };

            this.setTask = function(task) {
                var oldTask = self.tasks[task.model.id];
                if (oldTask !== undefined) {
                    var oldDependencies = this.getTaskDependencies(oldTask);
                    if (oldDependencies) {
                        angular.forEach(oldDependencies, function(dependency) {
                            dependency.disconnect();
                        });
                    }
                }
                self.tasks[task.model.id] = task;
                var dependencies = this.getTaskDependencies(task);
                if (dependencies) {
                    angular.forEach(dependencies, function(dependency) {
                        dependency.connect();
                    });
                }
            };

            /**
             * Retrieve the element representing the task.
             *
             * @param taskId id of the task element to retrieve.
             * @returns {*}
             */
            this.getTaskElement = function(taskId) {
                var taskObject = self.tasks[taskId];
                if (taskObject) {
                    return taskObject.$element;
                }
            };


            /**
             * Refresh jsplumb status based on defined dependencies.
             */
            this.refresh = function() {
                angular.forEach(this.dependenciesFrom, function(dependencies) {
                    angular.forEach(dependencies, function(dependency) {
                        if (!dependency.isConnected()) {
                            dependency.connect();
                        } else {
                            dependency.repaint();
                        }
                    });
                });
                //this.plumb.repaintEverything();
            };
        };
        return DependenciesManager;
    }]);
}());

(function() {
    'use strict';

    angular.module('gantt.dependencies').factory('GanttDependency', [function() {
        var Dependency = function(manager, fromId, toId) {
            this.manager = manager;
            this.fromId = fromId;
            this.toId = toId;
            this.connection = undefined;

            /**
             * Check if this dependency is connected.
             *
             * @returns {boolean}
             */
            this.isConnected = function() {
                if (this.connection) {
                    return true;
                }
                return false;
            };

            /**
             * Disconnect this dependency.
             */
            this.disconnect = function() {
                if (this.connection) {
                    this.manager.plumb.detach(this.connection);
                    this.connection = undefined;
                }
            };


            /**
             * Connect this dependency if both elements are available.
             *
             * @returns {boolean}
             */
            this.connect = function() {
                var fromElement = this.manager.getTaskElement(this.fromId);
                var toElement = this.manager.getTaskElement(this.toId);
                if (fromElement && toElement) {
                    var connection = this.manager.plumb.connect({
                        source: fromElement[0],
                        target: toElement[0],
                        anchors: ['Right', 'Left'],
                        endpoints: [
                            ['Rectangle', {'cssClass': 'gantt-dep-from-endpoint'}],
                            ['Rectangle', {'cssClass': 'gantt-dep-to-endpoint'}]
                        ],
                        connector: 'Flowchart'
                    });
                    this.connection = connection;
                    return true;
                }
                return false;
            };

            /**
             * Revalidate this dependency.
             *
             * @returns {boolean}
             */
            this.repaint = function() {
                var fromElement = this.manager.getTaskElement(this.fromId);
                var toElement = this.manager.getTaskElement(this.toId);
                this.manager.plumb.revalidate([fromElement[0], toElement[0]]);
            };
        };
        return Dependency;
    }]);
}());

angular.module('gantt.dependencies.templates', []).run(['$templateCache', function($templateCache) {

}]);

//# sourceMappingURL=angular-gantt-dependencies-plugin.js.map