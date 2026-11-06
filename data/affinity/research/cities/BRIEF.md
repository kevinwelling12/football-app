# City profiles brief (November 2026)

Kevin (Sacramento) rates football clubs, and his picks show he cares about the city a club is in: he leans toward San
Diego, Columbus, Leeds, Brighton and San Jose, away from Manchester, New York and Los Angeles, and he says Seattle and
Portland are similar cities. You profile each city in your batch so the model can learn which kinds of city he likes
and carry that to cities he hasn't rated. Each input row is one city: the clubs based there and one ground's lat/lon.

Name the city or town as people would (for clubs in a suburb or a different town, name that place, e.g. "Foxborough
(Boston area)", "Leverkusen"). Score every trait 0-10 with the anchors below, on one global scale: a 7 means the same in
Germany, Mexico or the US. Score the city's reputation and character as residents and visitors broadly describe it, not
one statistic. Today is 2026-11-07.

## Traits (0-10, integers or one decimal)
1. progressive: political and social culture. 10 among the most progressive places in its country and beyond
   (Portland, Seattle, Berlin, Barcelona, Brighton); 5 mixed or middle; 0 strongly conservative.
2. outdoors: nature and outdoor life at the door (mountains, coast, rivers, parks; people live outdoors).
   10 Vancouver, Seattle, Portland, San Diego, Denver; 5 average; 0 dense urban sprawl far from nature.
3. indie: independent, creative, quirky local culture (local over chains, music, arts, craft beer, a "keep it weird"
   streak). 10 Portland, Austin, Berlin, Brighton; 5 average; 0 chain-store suburb.
4. industrial: working-class, industrial or port heritage still part of its identity.
   10 Liverpool, Glasgow, Gelsenkirchen, Pittsburgh, Bilbao; 5 some; 0 none (resort, government or tech town).
5. glitz: glamour, wealth display, celebrity and status culture. 10 Los Angeles, Miami, Monaco, Dubai, Manhattan;
   5 average; 0 modest, unpretentious.
6. size: the size and weight of the metropolis. 10 a global megacity (New York, London, Los Angeles, Mexico City,
   Paris); 7 a large metro of several million (Seattle, Manchester, Munich); 5 about a million to two million;
   3 a mid-sized city of a few hundred thousand; 1 a town.
7. climate: a mild, sunny climate. 10 San Diego, Seville, Nice; 5 temperate with grey spells; 0 harsh (long cold
   winters or oppressive heat).

## Sources
Use your own knowledge where it is solid and standard; use WebFetch on English Wikipedia (the city's page:
demographics, culture, economy, climate) for any place you are not sure about. At most 4 WebSearch calls per batch.
Keep `why` short (a few words per trait is enough). Never invent facts; mark uncertain scores "estimate".

## Output
Write a JSON array to the output path you are given, one object per input row, in input order:
```json
{"city_key": "...", "city": "San Diego", "country": "USA",
 "progressive": 7, "outdoors": 10, "indie": 6, "industrial": 3, "glitz": 5, "size": 6, "climate": 10,
 "why": "one short line", "confidence": "high" | "medium" | "low"}
```
Valid JSON only. Edit no other file. No git.
