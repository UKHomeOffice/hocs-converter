#!/usr/bin/env bash

soffice \
--headless \
--invisible \
--nocrashreport \
--nodefault \
--nofirststartwizard \
--nologo \
--norestore \
--accept='socket,host=127.0.0.1,port=2002,tcpNoDelay=1;urp;StarOffice.ComponentContext;' &

npm start &

jest