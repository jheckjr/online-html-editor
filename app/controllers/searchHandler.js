'use strict';

var request = require('request');

let searchHandler = function (db) {
    let numResults = 10;
    let imgDb = db.collection('img-search');
    
    this.search = function (req, res) {
        let offset = req.query.offset;
        offset = offset < 0 || 90 < offset || typeof(offset) === 'undefined' ? 0 : offset;
        
        let searchUrl = 'https://api.cognitive.microsoft.com/bing/v5.0/images/search?';
        searchUrl += '&q=' + encodeURIComponent(req.params.searchterm);
        searchUrl += '&mkt=en-us';
        searchUrl += offset ? '&offset=' + offset : '';
        searchUrl += '&count=' + numResults;
        
        let options = {
            url: searchUrl,
            headers: {
                'User-Agent': 'request',
                'Ocp-Apim-Subscription-Key': process.env.BING_KEY_1
            }
        };
        var result = '';
        
        request(options, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                console.log('Success');
            } 
        }).on('data', function(data) {
            result += data;
        }).on('end', function () {
            searchCallback(result);
        });
        
        storeInDb();
 
        function searchCallback(results) {
            let data = JSON.parse(results);
            let imgArray = data.value.map(function (currVal) {
                let imgObj = {
                    url: currVal.contentUrl,
                    snippet: currVal.name,
                    thumbnail: currVal.thumbnailUrl,
                    hostpage: 'http://' + currVal.hostPageDisplayUrl
                };
                
                return imgObj;
            });
            
            res.send(imgArray);
        }    
        
        function storeInDb() {
            let newDoc = {
                searchterm: req.params.searchterm,
                time: (new Date().toISOString())
            };
            
            try {
                imgDb.insertOne(newDoc);
            } catch (e) {
                console.log(e);
            }
        }
    };
    
    this.latest = function (req, res) {
        imgDb.find({}, { _id: 0 }).sort({ time: -1 }).limit(10).toArray(function (err, docs) {
            if (err) {
                throw new Error('Error getting data');
            }
            
            res.send(docs);
        });
    };
};

module.exports = searchHandler;
