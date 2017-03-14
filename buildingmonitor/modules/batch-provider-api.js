/*
 * Copyright (c) 2016, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var getSchema, getData;

(function () {
    var CONTENT_TYPE_JSON = "application/json";
    var AUTHORIZATION_HEADER = "Authorization";
    var USER_TOKEN = "user";
    var TENANT_DOMAIN = "domain";
    var CONST_AT = "@";
    var USERNAME = "username";
    var HTTP_USER_NOT_AUTHENTICATED = 403;
    var JS_MAX_VALUE = "9007199254740992";
    var JS_MIN_VALUE = "-9007199254740992";
    var tableName = "ORG_WSO2_FLOOR_DEVICE_SENSORSTREAM";

    var typeMap = {
        "bool": "string",
        "boolean": "string",
        "string": "string",
        "int": "number",
        "integer": "number",
        "long": "number",
        "double": "number",
        "float": "number",
        "time": "time"
    };

    var log = new Log();
    var carbon = require('carbon');
    var JSUtils = Packages.org.wso2.carbon.analytics.jsservice.Utils;
    var AnalyticsCachedJSServiceConnector = Packages.org.wso2.carbon.analytics.jsservice.AnalyticsCachedJSServiceConnector;
    var AnalyticsCache = Packages.org.wso2.carbon.analytics.jsservice.AnalyticsCachedJSServiceConnector.AnalyticsCache;
    var cacheTimeoutSeconds = 5;
    var loggedInUser = null;
    var constants = require("/utils/constants.js").constants;


    var cacheSizeBytes = 1024 * 1024 * 1024; // 1GB
    response.contentType = CONTENT_TYPE_JSON;

    var authParam = request.getHeader(AUTHORIZATION_HEADER);
    if (authParam != null) {
        credentials = JSUtils.authenticate(authParam);
        loggedInUser = credentials[0];
    } else {
        var token = session.get(constants.USER_CACHE_KEY);
        if (token != null) {
            loggedInUser = token[USERNAME] + CONST_AT + token[TENANT_DOMAIN];
        } else {
            log.error("user is not authenticated!");
            response.status = HTTP_USER_NOT_AUTHENTICATED;
            print('{ "status": "Failed", "message": "User is not authenticated." }');
            return;
        }
    }

    var cache = application.get("AnalyticsWebServiceCache");
    if (cache == null) {
        cache = new AnalyticsCache(cacheTimeoutSeconds, cacheSizeBytes);
        application.put("AnalyticsWebServiceCache", cache);
    }
    var connector = new AnalyticsCachedJSServiceConnector(cache);


    /**
     * returns an array of column names & types
     * @param providerConfig
     */
    getSchema = function () {
        var schema = [];
        var result = connector.getTableSchema(loggedInUser, tableName).getMessage();
        result = JSON.parse(result);

        var columns = result.columns;
        Object.getOwnPropertyNames(columns).forEach(function (name, idx, array) {
            var type = "ordinal";
            if (columns[name]['type']) {
                type = columns[name]['type'];
            }
            schema.push({
                fieldName: name,
                fieldType: typeMap[type.toLowerCase()]
            });
        });
        // log.info(schema);
        return schema;
    };

    /**
     * returns the actual data
     * @param providerConfig
     * @param limit
     */
    getData = function (buildingId, floorId, fromTime, toTime, start, limit) {
        var luceneQuery = "timeStamp:[" + fromTime + " TO " + toTime + "]";
        var limitCount = limit | 100;
        var startCount = start | 0;
        var result;
        //if there's a filter present, we should perform a Lucene search instead of reading the table
        if (luceneQuery) {
            luceneQuery = 'buildingId:"' + buildingId + '" AND floorId:"' + floorId + '" AND ' + luceneQuery;
            var filter = {
                "query": luceneQuery,
                "start": startCount,
                "count": limitCount,
                "sortBy" : [{
                    "field" : "timeStamp",
                    "sortType" : "ASC"
                }]
            };
            result = connector.search(loggedInUser, tableName, stringify(filter)).getMessage();
        } else {
            var from = JS_MIN_VALUE;
            var to = JS_MAX_VALUE;
            result = connector.getRecordsByRange(loggedInUser, tableName, from, to, startCount, limitCount, null).getMessage();

        }
        result = JSON.parse(result);
        var data = [];
        for (var i = 0; i < result.length; i++) {
            var values = result[i].values;
            data.push(values);
        }
        return data;
    };

}());
