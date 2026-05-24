Update timtro-mcp to support:
- Support date_range filter in search rental tool: accept a number (days). for example: date_range = 5 -> within 5 days
- Replace area query with city + district. district query param accepts multiple values, separated by comma
- Add new tool get_areas: this tool returns list of cities. This helps the agent be able to pickup filterable areas into the search rental filter params. in each city item contains:
  + city
  + city_label
  + district_list
     + district
     + district_label
