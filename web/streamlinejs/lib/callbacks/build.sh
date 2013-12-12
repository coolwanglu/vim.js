cat require-stub.js runtime.js builtins.js  > streamline.js
java -jar ~/src/closure-compiler/compiler.jar  --js streamline.js --js_output_file streamline.min.js --language_in ECMASCRIPT5
