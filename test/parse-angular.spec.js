/* jshint jasmine: true, node: true */

var PARSE_CREDENTIALS = require('../credentials/parse.json');

describe('parse-angular', function() {

	'use strict';

	var MOCK_CLASS_NAME = 'MockClass';

	var TIMEOUT = 30000;

	var USERNAME;
	var PASSWORD;

	var MockClass;
	var mockObject;

	var provider;
	var $q;
	var $rootScope;
	var Parse;

	var user;

	var expectErrorItem = function(item) {
		expect(item instanceof Parse.Error);
	};

	beforeEach(angular.mock.module('ngMockE2E'));

	beforeEach(angular.mock.http.init);

	beforeEach(angular.mock.module('parse-angular.enhance', function(ParseProvider) {
		provider = ParseProvider;
	}));

	beforeEach(angular.mock.inject(function($httpBackend, _$q_, _Parse_, _$rootScope_) {

		var parsApi = function(url) {
			return url.indexOf('https://api.parse.com/') === 0;
		};

		var methods = [
			'GET',
			'POST',
			'PUT',
			'DELETE'
		];

		$q = _$q_;
		Parse = _Parse_;
		$rootScope = _$rootScope_;

		methods.forEach(function(method) {
			$httpBackend.when(method, parsApi).passThrough();
		});

		MockClass = Parse.Object.extend(MOCK_CLASS_NAME);

		mockObject = new MockClass();

		USERNAME = 'sample' + Math.random().toString(36).substr(2) + '@email.com';
		PASSWORD = Math.random().toString(36).substr(2);

	}));


	afterEach(angular.mock.http.reset);

	describe('ParseProvider', function() {

		var initialize;

		beforeEach(function() {
			initialize = Parse.initialize;
			spyOn(Parse, 'initialize');
		});

		afterEach(function() {
			Parse.initialize = initialize;
		});

		it('should have an array of interceptors', function() {
			expect(angular.isArray(provider.interceptors)).toBe(true);
		}, TIMEOUT);

		it('should call Parse.initialize when ParseProvider.initialize is called', function() {
			provider.initialize(PARSE_CREDENTIALS.APP_ID, PARSE_CREDENTIALS.JS_ID);
			expect(Parse.initialize).toHaveBeenCalledWith(PARSE_CREDENTIALS.APP_ID, PARSE_CREDENTIALS.JS_ID);
		}, TIMEOUT);

	});

	describe('Patched Methods', function() {

		beforeEach(function() {
			Parse.initialize(PARSE_CREDENTIALS.APP_ID, PARSE_CREDENTIALS.JS_ID);
		});

		describe('Parse.Object.prototype', function() {

			it('it should run all prototpye methods', function(done) {

				mockObject.set('field1', 'field1');
				mockObject.set('field2', 'field2');

				mockObject.save()
				.then(function(newMockData) {
					expect(newMockData.id).toBeDefined();
					expect(newMockData.get('field1')).toBe('field1');
					expect(newMockData.get('field2')).toBe('field2');
					newMockData.set('field3', 'field3');
					return newMockData.save();
				})
				.then(function(updatedMockData) {
					expect(updatedMockData.get('field3')).toBe('field3');
					updatedMockData.set('field4', 'field4');
					return updatedMockData.fetch();
				})
				.then(function(fetchedData) {
					expect(fetchedData.get('field4')).not.toBeDefined();
					return fetchedData.destroy();
				})
				.then(function(destroyedData) {

					return $q.all([
						destroyedData.fetch().catch(expectErrorItem),
						destroyedData.save().catch(expectErrorItem)
					]);

				})
				.finally(done);

			}, TIMEOUT);

		});

		describe('Parse.Object', function() {

			it('should run all static methods', function(done) {

				var objects;

				Parse.Object.saveAll([
					new MockClass({ field1: 'field1' }),
					new MockClass({ field1: 'field1' }),
					new MockClass({ field1: 'field1' }),
					new MockClass({ field1: 'field1' })
				])
				.then(function(result) {

					objects = result;

					result.forEach(function(item) {
						expect(item.get('field1')).toBe('field1');
						expect(item.id).toBeDefined();

						item.set('field2', 'field2');
					});

					return Parse.Object.saveAll(result);

				})
				.then(function(updatedObjects) {

					objects = updatedObjects.map(function(item, index) {
						expect(item.get('field2')).toBe('field2');
						expect(item.id).toBe(objects[index].id);
						return new MockClass({ objectId: item.id });
					});

					return Parse.Object.fetchAll(objects);

				})
				.then(function(fetchedObjects) {

					objects = fetchedObjects.map(function(item) {
						expect(item.get('field1')).toBe('field1');
						expect(item.get('field2')).toBe('field2');
						return new MockClass({ objectId: item.id });
					});

					return Parse.Object.fetchAllIfNeeded(objects);

				})
				.then(function(fetchedIfNeededObjects) {

					fetchedIfNeededObjects.forEach(function(item) {
						expect(item.get('field1')).toBe('field1');
						expect(item.get('field2')).toBe('field2');
					});

					return Parse.Object.destroyAll(fetchedIfNeededObjects);

				})

				.then(function(destroyedObjects) {

					return $q.all([
						Parse.Object.saveAll(destroyedObjects).catch(expectErrorItem),
						Parse.Object.fetchAll(destroyedObjects).catch(expectErrorItem),
						Parse.Object.fetchAllIfNeeded(destroyedObjects).catch(expectErrorItem),
						Parse.Object.destroyAll(destroyedObjects).catch(expectErrorItem)
					]);

				})

				.finally(done);

			}, TIMEOUT);

		});

		describe('Parse.Query.prototype', function() {

			var query;

			beforeEach(function() {
				query = new Parse.Query(MockClass);
			});

			describe('count()', function() {

				it('should count all objects', function(done) {
					query.count()
					.then(function(result) {
						expect(angular.isNumber(result)).toBe(true);
						done();
					});
				}, TIMEOUT);

			});

			describe('find()', function() {

				it('should find all objects', function(done) {

					query.find()
					.then(function(results) {
						results.forEach(function(item) {
							expect(item instanceof MockClass);
						});
						done();
					});

				}, TIMEOUT);

			});

			describe('first()', function() {

				it('should get the first item of results', function(done) {
					query.first()
					.then(function(item) {
						expect(item instanceof MockClass);
						done();
					});
				}, TIMEOUT);

			});

			describe('get()', function() {

				it('should get a specific item', function(done) {

					var id;

					query.first()
					.then(function(item) {
						id = item.id;
						return query.get(id);
					})
					.then(function(item) {
						expect(item.id).toBe(id);
						done();
					});

				}, TIMEOUT);

			});

			describe('each()', function() {

				it('should iterate over each searched item', function(done) {

					query.limit(3);

					query.each(function(item) {
						item.set('field1', 'field999');
						return item.save();
					})
					.then(function() {
						return query.find();
					})
					.then(function(items) {
						items.forEach(function(item) {
							expect(item.get('field1')).toBe('field999');
						});
						done();
					});
				}, TIMEOUT);


			});

		});

		describe('Parse.Cloud', function() {

			describe('run()', function() {

				it('should run a cloud code', function(done) {

					Parse.Cloud.run('hello')
					.then(function(result) {
						expect(result).toBe('Hello world!');
						done();
					});

				}, TIMEOUT);

			});

		});

		describe('Parse.User.prototype', function() {

			beforeEach(function() {

				user = new Parse.User({
					username: USERNAME,
					password: PASSWORD
				});

			});

			it('shoud run all prototype methods', function(done) {

				var newUser,
				oldSession;

				user.signUp()
				.then(function(user) {
					newUser = user;
					expect(newUser.getSessionToken()).toBeDefined();
					expect(newUser.get('username', USERNAME));

					user = new Parse.User({
						username: USERNAME,
						password: PASSWORD
					});

					return user.logIn();

				})
				.then(function(authenticatedUser) {
					oldSession = authenticatedUser.getSessionToken();
					expect(authenticatedUser.get('username')).toBe(newUser.get('username'));
					return authenticatedUser._upgradeToRevocableSession();
				})
				.then(function(session) {
					expect(session.getSessionToken()).not.toEqual(oldSession);
					done();
				});

			}, TIMEOUT);

		});

		describe('Parse.User', function() {

			it('should run all static methods', function(done) {

				var User = Parse.User;
				var newUser;
				var authUser;
				var asyncUser;
				var becameUser;
				var oldSession;

				User.signUp(USERNAME, PASSWORD)
				.then(function(user) {
					newUser = user;
					expect(user.get('username')).toBe(USERNAME);
					return User.logIn(USERNAME, PASSWORD);
				})
				.then(function(authenticatedUser) {
					authUser = authenticatedUser;
					expect(authUser.get('username')).toBe(USERNAME);
					return User.currentAsync();
				})
				.then(function(currentAsyncUser) {
					asyncUser = currentAsyncUser;
					expect(asyncUser.get('username')).toBe(USERNAME);
					return User.become(asyncUser.getSessionToken());
				})
				.then(function(_becameUser) {
					becameUser = _becameUser;
					expect(becameUser.getSessionToken()).toBe(asyncUser.getSessionToken());
					return User.requestPasswordReset(USERNAME);
				})
				.then(function() {
					oldSession = becameUser.getSessionToken();
					return User.enableRevocableSession();
				})
				.then(function(session) {
					expect(session instanceof Parse.Session);
					expect(session.getSessionToken()).not.toEqual(oldSession);
					return User.logOut();
				})
				.finally(function(result) {
					done();
				});

			}, TIMEOUT);

		});

		describe('Parse.Config', function() {

			describe('get()', function() {
				it('should get config', function(done) {
					Parse.Config.get()
					.then(function(config) {
						expect(config.get('param1')).toBe('param1');
						done();
					}, TIMEOUT);
				});
			});

		});

		describe('Parse.File', function() {

			describe('save()', function() {
				it('should save a file', function(done) {
					var bytes = [ 0xBE, 0xEF, 0xCA, 0xFE ];
					var file = new Parse.File("myfile.txt", bytes);

					file.save()
					.then(function(newFile) {
						expect(newFile.url()).toBeDefined();
						expect(newFile instanceof Parse.File);
						done();
					});
				}, TIMEOUT);
			});

		});

		describe('Parse.Session', function() {

			describe('current()', function() {

				it('should get the currently loggedin session', function(done) {

					var createUser = function() {
						return new Parse.User({
							username: USERNAME,
							password: PASSWORD
						});
					};

					var user = createUser();
					var session;

					user.signUp()
					.then(function(newUser) {
						return createUser().logIn();
					})
					.then(function(user) {
						return user._upgradeToRevocableSession();
					})
					.then(function() {
						return Parse.Session.current();
					})
					.then(function(session) {
						expect(session instanceof Parse.Session);
					})
					.finally(done);

				}, TIMEOUT);

			});

		});

		describe('Parse.GeoPoint', function() {

			describe('current()', function() {

				it('should get the current geo location', function(done) {

					var coords = { latitude: 40.714224, longitude: -73.961452 };

					// mock navigator
					navigator.geolocation = {
						getCurrentPosition: function(callback) {
							callback({ coords: coords });
						}
					};

					Parse.GeoPoint.current()
					.then(function(geoPoint) {
						expect(geoPoint instanceof Parse.GeoPoint);
						expect(geoPoint.longitude).toBe(coords.longitude);
						expect(geoPoint.latitude).toBe(coords.latitude);
						done();
					});

				}, TIMEOUT);

			});

		});

		describe('Enhancement', function() {

			var query;

			beforeEach(function() {
				query = new Parse.Query(MockClass);
			});


			it('Parse.Query.prototype.loadMore()', function(done) {

				var loadMore = function() {
					return query.loadMore()
					.then(function(objects) {
						if(query.hasMoreToLoad) {
							expect(objects.length).toBe(query._limit);
							return loadMore();
						}
						expect(objects.length < query._limit).toBe(true);
						done();
					});
				};

				loadMore();

			});

		});

		describe('Parse.Object', function() {

			var RandomClass;
			var randomClassName;
			var random;

			beforeEach(function() {
				randomClassName = 'RandomClass' + Math.random().toString(36).substr(2);
				RandomClass = Parse.Object.extend({
					className: randomClassName,
					attrs: ['random1', 'random2', 'random3', 'random4'],

					getRandom3: function() {
						return (this.get('random3') || 0) + 100;
					},

					setRandom4: function(value) {
						this.set('random4', (value || 0) + 200);
					}
				});
				random = new RandomClass();
			});

			describe('extend()', function() {

				it('should have a random getters and setters', function() {
					expect(random.getRandom1()).toBeUndefined();
					expect(random.getRandom2()).toBeUndefined();
					expect(random.getRandom3()).toBe(100);
					expect(random.getRandom4()).toBeUndefined();
					random.setRandom1(100);
					random.setRandom2(200);
					random.setRandom3(300);
					random.setRandom4(400);
					expect(random.getRandom1()).toBe(100);
					expect(random.getRandom2()).toBe(200);
					expect(random.getRandom3()).toBe(400);
					expect(random.getRandom4()).toBe(600);
				});

			});


		});

	});


});
