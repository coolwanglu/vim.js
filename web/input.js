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
var events = [];
document.addEventListener('mousemove', function(e){
    events.push(e);
}, false);


console.log('step 1');
sleep(1000);
console.log('step 2');
sleep(1000);
console.log('step 3');

//while(true) {
    if(events.length > 0) {
        console.log('got events:', events.length);
        events.length = 0;
    }
    sleep(100);
//}

