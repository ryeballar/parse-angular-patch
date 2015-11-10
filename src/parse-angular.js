(function(ng, Parse){

	'use strict';

	var forEach = ng.forEach,
		module = ng.module,
		bind = ng.bind,
		isObject = angular.isObject,
		isArray = angular.isArray,
		extend = angular.extend,
		copy = angular.copy,
		uppercase = angular.uppercase,
		isUndefined = ng.isUndefined,
		isDefined = ng.isDefined,
		isFunction = ng.isFunction,
		isNumber = ng.isNumber,
		noop = ng.noop;

	var THEN_KEY = 'then';
	var CATCH_KEY = 'catch';

	var reduce = function(collection, callback, value) {
		var skip = isUndefined(value);
		forEach(collection, function(item, index) {
			if(skip) {
				value = item;
				skip = false;
				return;
			}
			value = callback(value, item, index);
		});
		return value;
	};

	module('parse-angular', [])

	.provider('Parse', function() {

		var provider = {};

		provider.interceptors = [];

		provider.initialize = function() {
			return Parse.initialize.apply(Parse, arguments);
		};

		provider.$get = ['$q', '$injector', '$rootScope', function($q, $injector, $rootScope) {

			var isPatchRunning = false,
				successInterceptors = [],
				errorInterceptors = [];

			//-------------------------------------
			// Structured object of what we need to update
			//-------------------------------------
			var methodsToUpdate = {
				"Object": {
					prototypes: ['save', 'fetch', 'destroy'],
					statics: ['saveAll', 'destroyAll', 'fetchAll', 'fetchAllIfNeeded'],
				},
				"Query": {
					prototypes: [
						'count',
						'find',
						'first',
						'get'
					],
					statics: []
				},
				"Cloud": {
					prototypes: [],
					statics: ['run']
				},
				"User": {
					prototypes: [
						'_upgradeToRevocableSession',
						'logIn',
						'signUp'
					],
					statics: [
						'become',
						'currentAsync',
						'enableRevocableSession',
						'logIn',
						'logOut',
						'requestPasswordReset',
						'signUp'
					]
				},
				"FacebookUtils": {
					prototypes: [],
					statics: ['logIn', 'link', 'unlink']
				},
				"Config": {
					prototypes: [],
					statics: ['get']
				},
				"File": {
					prototypes: ['save'],
					statics: []
				},
				"Session": {
					prototypes: [],
					statics: ['current']
				},
				"Push": {
					prototypes: [],
					statics: ['send']
				},
				"GeoPoint": {
					prototypes: [],
					statics: ['current']
				},
				"Analytics": {
					prototypes: [],
					statics: ['track']
				}
			};

			// gather success and error interceptors
			forEach(provider.interceptors, function(interceptor, index) {

				// inject interceptors
				interceptor = angular.isString(interceptor)?
					// get interceptor as a service or factory
					$injector.get(interceptor):
					// get interceptor as a factory function
					$injector.invoke(interceptor);

				// register success interceptor
				if(interceptor.success) {
					successInterceptors.push(bind(interceptor, interceptor.success));
				}

				// register error interceptor
				if(interceptor.error) {
					errorInterceptors.push(bind(interceptor, interceptor.error));
				}

			});

			// sequential invocation of promises
			// base on an array of callbacks
			var sequentialPromise = function(promise, arrayFns, promiseKey) {
				return reduce(arrayFns, function(promise, interceptor) {
					return promise[promiseKey](interceptor);
				}, promise);
			};

			// run success interceptors
			var runSuccessInterceptors = function(object) {
				return sequentialPromise($q.when(object), successInterceptors, THEN_KEY);
			};

			// run error interceptors
			var runErrorInterceptors = function(object, error) {
				// set original objet in the error object
				// to promote recovery, this may not work for
				// static objects
				error.object = object;
				return sequentialPromise($q.reject(error), errorInterceptors, CATCH_KEY);
			};

			var digest = function() {
				if(!$rootScope.$$phase) {
					$rootScope.$digest();
				}
			};

			// function to create a patched method
			var patchMethod = function(method) {

				return function() {

					var self = this,
						parsePromise,
						ngDeferred;

					// Don't apply $q promise when called internally
					if(isPatchRunning) {
						return method.apply(self, arguments);
					}

					// ensures that all internal Parse.Promise calls are uninterrupted
					// by our $q promsie patch
					isPatchRunning = true;

					ngDeferred = $q.defer();

					// invoke method
					parsePromise = method.apply(self, arguments)
					.then(
						// resolve with $q promise
						bind(ngDeferred, ngDeferred.resolve),
						// reject with $q promise
						bind(ngDeferred, ngDeferred.reject)
					);

					// disabling Parse.Promise interruption
					isPatchRunning = false;

					// return $q promise
					return ngDeferred.promise
					.then(runSuccessInterceptors)
					.catch(bind(null, runErrorInterceptors, self));

				};

			};

			var patchMethods = function(object, methods, className) {
				forEach(methods, function(methodName) {
					if(!isFunction(object[methodName])) {
						throw new Error('[parse-angular-patch]: ' + className + '.' + methodName + ' does not exist, patching failed!');
					}
					object[methodName] = patchMethod(object[methodName]);
				});
			};

			// start $q patch
			forEach(methodsToUpdate, function(methodTypes, className) {

				var ParseClass = Parse[className];

				patchMethods(ParseClass, methodTypes.statics, className);
				patchMethods(ParseClass.prototype, methodTypes.prototypes, className + '.prototype');

			});

			var origQueryEach = Parse.Query.prototype.each;

			// A proper patch of .each()
			Parse.Query.prototype.each = function(callback) {

				return this.find()
				.then(function(objects) {
					return reduce(objects, function(promise, object) {
						return promise.then(function() {
							return callback(object);
						});
					}, $q.when());
				});

			};

			return Parse;

		}];

		return provider;

	});

	angular.module('parse-angular.enhance', ['parse-angular'])
	.run(['Parse', '$q', function(Parse, $q) {

		var classMap = {};

		/// Create a method to easily access our object
		/// Because Parse.Object("xxxx") is actually creating an object and we can't access static methods
		Parse.Object.getClass = function(className) {
			return classMap[className];
		};

		///// CamelCaseIsh Helper
		var capitaliseFirstLetter =function (string) {
			return uppercase(string.charAt(0)) + string.slice(1);
		};

		///// Override orig extend
		var origObjectExtend = Parse.Object.extend;

		Parse.Object.extend = function(protoProps) {

			var newClass = origObjectExtend.apply(this, arguments);
			var className,
			attrs;

			if(isObject(protoProps)) {

				className = protoProps.className;
				attrs = protoProps.attrs;

				if(isArray(attrs)) {

					/// Generate setters & getters
					forEach(attrs, function(currentAttr){

						var field = capitaliseFirstLetter(currentAttr),
							getFnKey = 'get' + field,
							setFnKey = 'set' + field;

						// Don't override if we set a custom setters or getters

						newClass.prototype[getFnKey] = newClass.prototype[getFnKey] || function() {
							return this.get(currentAttr);
						};

						newClass.prototype[setFnKey] = newClass.prototype[setFnKey] || function(data) {
							this.set(currentAttr, data);
							return this;
						};

					});

				}

			} else if(angular.isString(protoProps)) {
				className = protoProps;
			}

			classMap[className] = newClass;

			return newClass;

		};

		// Enhance Parse Query prototype
		extend(Parse.Query.prototype, {
			hasMoreToLoad: function() {
				var self = this;
				var newObjects = self.newObjects;
				return (isArray(newObjects) &&
					newObjects.length === self.getLimit()) ||
					isUndefined(newObjects);
			},
			getLimit: function() {
				var limit = this._limit;
				return isNumber(limit) && limit !== -1? limit: 100;
			},
			getSkip: function() {
				var skip = this._skip;
				return isNumber(skip)? skip: 0;
			},
			storeOriginal: function() {

				var self = this;

				if(isUndefined(self.objects) && isUndefined(self.newObjects)) {
					self._copy = angular.copy(self);
				}

			},
			reset: function() {
				var self = this;
				extend(self, self._copy);
			},
			loadMore: function() {
				var self = this;
				var limit = self._limit = self.getLimit();
				var skip = self._skip = self.getSkip();

				self.storeOriginal();

				return self.find()
				.then(function(objects) {
					self.newObjects = objects || [];
					self.objects = (self.objects || []).concat(objects);
					if(self.hasMoreToLoad()) {
						self._skip = skip + limit;
					}
					return objects;
				});
			},
			loadMoreWhile: function(until) {
				var self = this;

				if(isFunction(until)) {
					if(until(self)) {
						return self.loadMore()
						.then(bind(self, self.loadMoreUntil, until));
					}
					return $q.when(self);
				}

				throw new Error('until callback is not a function');
			}
		});

	}]);

}).apply(null, (function(context) {

	var ng = context.angular;
	var Parse = context.Parse;

	if(!ng) {
		throw new Error('[parse-angular-patch]: AngularJS was not loaded');
	}

	if(!Parse) {
		throw new Error('[parse-angular-patch]: Parse was not loaded');
	}

	return [ng, Parse];

})(window));
