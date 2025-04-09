https://developer.accuweather.com/user/me/apps
samainfirenight@yahoo.com
Alicefaye1

API KEY: W4QuvcA5MG9RUbnmOvPGbCm8L7x8BVlo  <--- Minute Cast

API KEY: 6Sh4pnAtHsPz6If0dW6cBZAXNDGe7GX8  <--- Core Weather (Use this one)




Get current weather
/weather <location>

Available arguments:

units - metric or imperial
condition - the result should include the weather condition, e.g. "Clear". The default is true.
temperature - the result should include the temperature. The default is true.
feelslike - the result should include the "feels like" temperature. The default is false. Only works if temperature is true.
humidity - the result should include the humidity. The default is false.
wind - the result should include the wind speed and direction. The default is false.
pressure - the result should include the pressure. The default is false.
visibility - the result should include the visibility. The default is false.
uvindex - the result should include the UV index. The default is false.
precipitation - the result should include the precipitation. The default is false.
Get weather forecast
/forecast <location>

Available arguments:

units - metric or imperial

##Examples##

[1]
/weather units=metric condition=true temperature=true feelslike=true humidity=true wind=true pressure=true visibility=true uvindex=true precipitation=true London, UK

[2]
/forecast units=imperial Tampa, FL