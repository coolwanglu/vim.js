cat require-stub.js runtime.js > streamline.js
java -jar $EM_DIR/third_party/closure-compiler/compiler.jar  --js streamline.js --js_output_file streamline.min.js --language_in ECMASCRIPT5
