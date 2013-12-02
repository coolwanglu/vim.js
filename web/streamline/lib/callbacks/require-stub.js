if (!Object.create || !Object.defineProperty || !Object.defineProperties) alert("Example will fail because your browser does not support ECMAScript 5. Try with another browser!");
var __filename = "" + window.location;

window.Streamline = { globals: {} };

function require(str) {
	if (str == "streamline/lib/util/flows") return Streamline.flows;
	else if (str == "streamline/lib/globals") return Streamline.globals;
	else if (str == "streamline/lib/version") return Streamline.version;
	else if (str == "streamline/lib/callbacks/runtime") return Streamline.runtime;
	else if (str == "streamline/lib/callbacks/transform") return Streamline;
	else if (str == "streamline/lib/callbacks/builtins") return Streamline.builtins;
	else if (str == "streamline/lib/globals") return Streamline.globals;
	else if (str == "streamline/lib/util/future") return Streamline.future;
	else if (str == "streamline/lib/util/source-map") return Streamline.sourceMap.exports;
	else alert("cannot require " + str)
}