function b() {
    return 10;
}
function a() {
    consoloe.log('in a');
    var i = b();
    console.log('here ' + i);
    console.log('input.js:before');
    sleep(1000);
    console.log('input.js:end');
}

console.log('test1');
sleep(1000);
console.log('test2');
a();
console.log('test3');
