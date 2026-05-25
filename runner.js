// ======================================
// PROVIDE FOLDER NAME
// ======================================

// Example:
// 'Create_User'
// 'Orders_API'
// null -> run ROOT

const folderName =
    'Create_User';

// ======================================
// PROVIDE ITERATION COUNT
// ======================================

// Examples:
//
// null -> run ALL iterations
// 1    -> run first iteration only
// 5    -> run first 5 iterations

const iterationCount =
    null;

// ======================================
// SET ARGUMENTS
// ======================================

process.argv[2] =
    folderName;

process.argv[3] =
    iterationCount;

// ======================================
// RUN FRAMEWORK
// ======================================

require('./scripts/run-tests');
