#!/bin/sh -x
curl -X POST 'http://localhost:3000/api/register' -H 'Content-Type:application/json' -d '{"username":"'$1'","password":"'$2'"}' -w '\n'