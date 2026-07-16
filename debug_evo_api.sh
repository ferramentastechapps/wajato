#!/bin/bash
echo "=== Todos os paths de instance ==="
curl -s http://localhost:8080/api-json | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    print('Keys:', list(data.keys()))
    paths = data.get('paths', {})
    print('Total paths:', len(paths))
    for p in list(sorted(paths.keys()))[:50]:
        print(p)
except Exception as e:
    print('Error:', e)
"
