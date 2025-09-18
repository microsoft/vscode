export class EsTemplate {
    public static query = `GET /myIndex/_search
{
  "_source": {
    "includes":[$fields]
  },
  "query": {
    "bool": {
      "must": [
        {
          "match_all": {}
        }
      ],
      "filter": [],
      "should": [],
      "must_not": []
    }
  },
  "sort": [
    {
      "_score": {
        "order": "desc"
      }
    }
  ],
  "highlight": {
    "pre_tags": [
      "<span style='color:red;'>"
    ],
    "post_tags": [
      "</span>"
    ],
    "fields": {
      "*": {}
    },
    "fragment_size": 2147483647
  }
}

POST /myIndex/_doc
{
    "id": 1,
    "name": "test"
}`;
}