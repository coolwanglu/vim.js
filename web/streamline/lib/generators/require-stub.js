if (!Object.create || !Object.defineProperty || !Object.defineProperties) alert("Example will fail because your browser does not support ECMAScript 5. Try with another browser!");
var __filename = "" + window.location;

window.Streamline = { globals: {} };

function require(str) {
	if (str == "streamline/lib/util/flows") return Streamline.flows;
	else if (str == "streamline/lib/fibers/walker") return Streamline.walker;
	else if (str == "streamline/lib/fibers/transform") return Streamline;
	else if (str == "streamline/lib/generators/runtime") return Streamline.runtime;
	else if (str == "streamline/lib/generators/transform") return Streamline;
	else if (str == "streamline/lib/generators/builtins") return Streamline.builtins;
	else if (str == "streamline/lib/globals") return Streamline.globals;
	else if (str == "streamline/lib/util/future") return Streamline.future;
	else if (str == "streamline/lib/callbacks/transform") return Streamline; // hack for eval test
	else alert("cannot require " + str)
}
