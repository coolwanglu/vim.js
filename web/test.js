function async_load(url, onload, onerror) {
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function xhr_onload() {
    if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
      onload(xhr.response);
    } else {
      onerror();
    }
  };
  xhr.onerror = onerror;
  xhr.send(null);
}

function sleep(cb, ms) {
    setTimeout(cb, ms);
}
Narcissus.interpreter.asyncFunctions[sleep] = true;

function run_script(script, cb) {
    Narcissus.interpreter.evaluate(script, '', 0, cb);
}

function work(script){
    run_script(script, function() { console.log('it worked!'); });
}

async_load('input.js', function(res){
    work(res);
});
