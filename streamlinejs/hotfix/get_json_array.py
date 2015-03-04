#!/usr/bin/env python
# Get JSON array representation of a file
# Necessary for hotfixes
#
# Copyright (c) 2013 Lu Wang <coolwanglu@gmail.com>

import json
import sys

print json.dumps(map(ord,open(sys.argv[1]).read())).replace(' ','')
