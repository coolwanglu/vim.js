function b() {
    return 10;
}
function a() {
    var i = b();
    console.log('here ' + i);
    console.log('input.js:before');
    sleep(1000);
    console.log('input.js:end');
}

console.log('a ' + console.log('start'));
console.log('start2');
a();
