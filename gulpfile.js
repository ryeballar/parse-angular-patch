// Include gulp
var gulp = require('gulp'),
	Server = require('karma').Server,
	runSequence = require('run-sequence').use(gulp);

// Include Our Plugins
var jshint = require('gulp-jshint');
var uglify = require('gulp-uglify');

// Lint Task
gulp.task('lint', function() {
    gulp.src('./src/parse-angular.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

gulp.task('uglify', function() {
    gulp.src('./src/parse-angular.js')
        .pipe(uglify())
        .pipe(gulp.dest('./dist'));
});

gulp.task('test:server', function(done) {
	test(true, done);
});

gulp.task('test:build', function(done) {
	test(false, done);
});

// Default Task
gulp.task('default', function() {

	runSequence(
		'test:build',
		'lint',
		'uglify'
	);

});

function test(isServer, done) {

	var server = new Server({

		singleRun: !isServer,
		files: [
			'test/common.js',
			'src/**/*.js',
			'test/*.spec.js'
		],
		frameworks: [
			'browserify',
			'jasmine'
		],
		browsers: ['PhantomJS'],
		preprocessors: {
			'test/**/*.js': ['browserify'],
			'src/**/*.js': ['browserify']
		},
		reporters: ['spec']

	}, function(exitCode) {

		if(exitCode) {
			process.exit();
			return;
		}

		done();
	});

	server.start();

}
