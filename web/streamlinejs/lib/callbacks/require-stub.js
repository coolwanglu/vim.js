if (!Object.create || !Object.defineProperty || !Object.defineProperties) 
    alert("This browser is not supported!");
var __filename = "" + window.location;

window.Streamline = { globals: {} };

function require(str) {
	if (str == "streamline/lib/globals") return Streamline.globals;
	else if (str == "streamline/lib/version") return Streamline.version;
	else if (str == "streamline/lib/callbacks/runtime") return Streamline.runtime;
	else if (str == "streamline/lib/callbacks/transform") return Streamline;
	else if (str == "streamline/lib/callbacks/builtins") return Streamline.builtins;
	else if (str == "streamline/lib/globals") return Streamline.globals;
	else alert("cannot require " + str)
}
