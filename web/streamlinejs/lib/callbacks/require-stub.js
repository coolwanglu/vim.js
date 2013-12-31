if (!Object.create || !Object.defineProperty || !Object.defineProperties) 
    alert("This browser is not supported!");
var __filename = "" + window.location;

window.Streamline = { globals: {} };

function require(str) {
	if (str == "streamline/lib/globals") return Streamline.globals;
	else if (str == "streamline/lib/callbacks/runtime") return Streamline.runtime;
	else alert("cannot require " + str)
}
