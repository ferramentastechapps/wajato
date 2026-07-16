#!/bin/bash
echo "=== Paths disponíveis na Evolution API ==="
curl -s http://localhost:8080/api-json | python3 -c "
import json, sys
data = json.load(sys.stdin)
paths = data.get('paths', {})
for path in sorted(paths.keys()):
    methods = list(paths[path].keys())
    print(f'{path}: {methods}')
" | grep -i "pair\|pairing\|code\|connect"
echo ""
echo "=== Todos os paths de instance ==="
curl -s http://localhost:8080/api-json | python3 -c "
import json, sys
data = json.load(sys.stdin)
paths = data.get('paths', {})
for path in sorted(paths.keys()):
    if 'instance' in path.lower():
        methods = list(paths[path].keys())
        print(f'{path}: {methods}')
"
