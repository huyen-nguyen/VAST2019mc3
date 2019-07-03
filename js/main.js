const startDate = Date.parse("2020-04-06 00:00:00");
const endDate = Date.parse("2020-04-10 11:59:00");
const hourToMS = 60 * 60 * 1000;
const streamStepUnit = 0.5; // half hour
const formatTimeLegend = d3.timeFormat("%B %d, %-I:%M:%S %p");
const formatTimeWS = d3.timeFormat("%-m/%-d %-I%p");
const formatTimeDetailBox = d3.timeFormat("%B %d, %-I:%M %p");
const topics = ["message", "location"];
const topicColor = ["#919191", "#770000"];
const margin = {top: 30, right: 20, bottom: 50, left: 50},
    width = 1200 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;
const initTimestamp = 1586344602000;
const bisect = d3.bisector(d => {
    return d.time
}).left;
const columns = ["time", "location", "account", "message"];
const firstStrike = [1586200114000, 1586204242000];
const secondStrike = [1586350794000, 1586356642000];
const thirdStrike = [1586459159000, 1586468448000];

let data;
let streamStep = streamStepUnit * hourToMS;
let streamRawData;
let highestStack;
let keyList;
let xScale = d3.scaleTime()
    .range([0, width]);

let yScale = d3.scaleLinear()
    .range([height, 0]);
let config = {
    topWord: 70,
    minFont: 10,
    maxFont: 25,
    tickFont: 12,
    legendFont: 12,
    curve: d3.curveMonotoneX
};
let main = "#mainContent";
let current;
let numHourAfter = 6;
let wsContainer;
let wsContainerWidth = function (numHourAfter) {
    return d3.scaleLinear()
        .domain([0,30])
        .range([800, 2000])(numHourAfter);
};
let slidingGroup;
let slidingWindow;
let slidingWidth = function(numHourAfter){
    return d3.scaleLinear()
        .domain([0,30])
        .range([0, (30/108) * width])(numHourAfter)
};
const stepDash = slidingWidth(30)/30;
let dashedGroup;
let vertical;
let dataOption = [];
let wsData;
loadData();
function loadData(){
    d3.csv("data/YInt.csv", function (error, inputData) {
        if (error) throw error;
        else {
            data = inputData.map(d => {
                return {
                    time: Date.parse(d.time),
                    location: d.location,
                    account: d.account,
                    message: d.message
                }
            });
            console.log(data);
            dataOption = taxonomy.filter(d => d.parent === initOption);
            streamRawData = getStreamData(data, dataOption);
            drawGraph();
            drawPanel();

            wsContainer = d3.select("body").append("svg")
                .attr("width", wsContainerWidth(numHourAfter))
                .attr("height", 500);

            wsTooltipDiv = d3.select("body").append("div")
                .attr("class", "wsTooltip")
                .style("opacity", 0);
            current = initTimestamp;
            updateWindow(current);
            d3.select('#loading').remove();
        }
    });
}
function countOnce(d, dataOption, streamData00, wsRawData){
    let flag = false;
    for (let i = 0; i < dataOption.length; i++) {
        for (let j = 0; j < dataOption[i].content.length; j++) {
            if (d.message.toLowerCase().indexOf(dataOption[i].content[j]) >= 0) {
                streamData00[dataOption[i].id].push(d.time);
                wsRawData.push(d);
                flag = true;
                // break out of content of this data option
                break;
            }
        }
        //break out of data options
        if (flag) break;
    }
}
function countMultiple(d, dataOption, streamData00, wsRawData){
    let obj = {};
    for (let i = 0; i < dataOption.length; i++) {
        for (let j = 0; j < dataOption[i].content.length; j++) {
            if (d.message.toLowerCase().indexOf(dataOption[i].content[j]) >= 0) {
                streamData00[dataOption[i].id].push(d.time);
                if (!obj[d.time]){
                    wsRawData.push(d);
                    obj[d.time] = true;
                }
                // break out of content of this data option
                break;
            }
        }
    }
}
function getStreamData(data, dataOption){
    wsRawData = [];
    let streamData00 = {};
    // init streamData00
    for (let i = 0; i < dataOption.length; i++) {
        streamData00[dataOption[i].id] = [];
    }
    data.forEach(d => {
        countMultiple(d, dataOption, streamData00, wsRawData);
    });
    console.log(streamData00);
    return processStreamData(streamData00)
}

function getStreamMultipleData(data){
    wsRawData = [];
    let streamData00 = {};
    for (let i = 0; i < dataOption.length; i++) {
        streamData00[dataOption[i].id] = [];
    }

    let allKeywords = [];
    allKeywords = taxonomy.filter(d => d.content)
        .map(d => allKeywords.concat(d.content)).flat();

    data.map(d => {
        // check with other keywords
        countMultiple(d, dataOption, streamData00, wsRawData);

        // the rest
        let flagOther = true;
        for (let i = 0; i < allKeywords.length; i++){
            if (d.message.toLowerCase().indexOf(allKeywords[i]) >= 0){
                flagOther = false;
                break;
            }
        }
        if (flagOther){
            streamData00[otherPostID].push(d.time);
            wsRawData.push(d);
        }
    });
    return processStreamData(streamData00);
}
function getStreamOtherPostData(data){
    wsRawData = [];
    let streamData00 = {};
    streamData00[otherPostID] = [];

    let allKeywords = [];
    allKeywords = taxonomy.filter(d => d.content)
        .map(d => allKeywords.concat(d.content)).flat();

    data.map(d => {
        let flag = true;
        for (let i = 0; i < allKeywords.length; i++){
            if (d.message.toLowerCase().indexOf(allKeywords[i]) >= 0){
                flag = false;
                break;
            }
        }
        if (flag){
            streamData00[otherPostID].push(d.time);
            wsRawData.push(d);
        }
    });
    return processStreamData(streamData00);
}
function processStreamData(streamData00){
    let streamData = [];
    let streamData11 = {};
    // streamRawData
    keyList = d3.keys(streamData00);
    keyList.forEach(d => {
        streamData11[d] = [];
        for (let i = startDate; i < endDate; i += streamStep) {
            // get index of that start and end
            streamData11[d].push({
                timestamp: i,
                count: streamData00[d].slice(
                    d3.bisect(streamData00[d], i),
                    d3.bisect(streamData00[d], i+streamStep))
                    .length
            })
        }
    });
    for (let i = 0; i < streamData11[keyList[0]].length; i++) {
        let obj = {};
        obj.time = streamData11[keyList[0]][i].timestamp;
        keyList.forEach(key => {
            obj[key] = streamData11[key][i].count;
        });
        streamData.push(obj);
    }
    return streamData;
}
function getWSdata(rangedData) {
    let wsData = {};
    let timeObj = {};
    rangedData.forEach(d => {
        let thisHour = nearestHour(d.time);
        timeObj[thisHour] = true;
        let date = formatTimeWS(new Date(d.time));

        let wordArray = splitText(d.message);

        if (!wsData[date]) wsData[date] = {};

        wsData[date]["message"] = wsData[date]["message"] ? (wsData[date]["message"].concat(wordArray)) : (wordArray);
        wsData[date]["location"] = wsData[date]["location"] ? (wsData[date]["location"].concat(d.location)) : [d.location];
    });

    wsData = d3.keys(wsData).map(function (date, i) {
        var words = {};
        topics.forEach(topic => {
            //Count word frequencies
            var counts = wsData[date][topic].reduce(function (obj, word) {
                if (!obj[word]) {
                    obj[word] = 0;
                }
                obj[word]++;
                return obj;
            }, {});
            //Convert to array of objects
            words[topic] = d3.keys(counts).map(function (d) {
                return {
                    text: d,
                    frequency: counts[d],
                    topic: topic,
                    id: removeChar(d) + d3.keys(timeObj)[i]
                }
            }).sort(function (a, b) {//sort the terms by frequency
                return b.frequency - a.frequency;
            })
            ;
        });
        return {
            time: d3.keys(timeObj)[i],
            date: date,
            words: words
        }
    });
    return wsData;
}

function drawGraph() {
    let svg = d3.select(main)
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom);

    // main svg
    let g = svg.append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    //Create the stack layout for the data
    const stack = d3.stack().keys(keyList)
        .offset(d3.stackOffsetNone);

    const stacks = stack(streamRawData);
    highestStack = stacks[stacks.length-1].map(d => {
        return {
            y: d[1],
            time: d.data.time
        }
    });
    //The scales
    xScale.domain([startDate, endDate]);
    yScale.domain(d3.extent(stacks.flat().flat()));

    //The x axis
    const xAxisGroup = g.append("g").attr("transform", "translate(0," + height + ")");
    const xAxis = d3.axisBottom(xScale);
    let xAxisNodes = xAxisGroup.call(xAxis);
    styleAxis(xAxisNodes);

    //The y Axis
    const yAxisGroup = g.append('g').attr('id','yAxis');
    const yAxis = d3.axisLeft(yScale);
    let yAxisNodes = yAxisGroup.call(yAxis);
    styleAxis(yAxisNodes);

    //The area function used to generate path data for the area.
    const areaGen = d3.area()
        .x(d => xScale(d.data.time))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    // Main stream
    g.append("g")
        .attr("id", "streamG")
        .selectAll(".layer")
        .data(stacks).enter()
        .append("path")
        .attr("class", "layer")
        .attr("d", areaGen)
        .attr("fill", (d, i) => {
            return taxonomy.find(d => d.id === keyList[i]).color;
        });

    // markers


    // Running tooltip for date and time
    let tooltip = d3.select(main)
        .append("div")
        .attr("class", "slidingTooltip")
        .style("top", (height + margin.top/2 + margin.bottom) + "px")
        .style("font-size", "15px")
        .style("pointer-events", "none")
        .html(
        '<text>' + formatTimeLegend(initTimestamp) + "</text>")
        .style("left", (margin.left + xScale(initTimestamp) + 16) + "px");

    // Long vertical index line
    vertical = g
        .append("line")
        .attr("id", "vertical")
        .style("stroke", "black")
        .attr("y1", 0)
        .attr("y2", height + margin.top + margin.bottom)
        .attr("x1", xScale(initTimestamp))
        .attr("x2", xScale(initTimestamp))
        .raise();

    // Sliding window
    let windowSize = {
        height: 287,
        width: slidingWidth(numHourAfter),
    };

    slidingGroup = g.append("g").attr("id", 'slidingGroup');
    slidingWindow = slidingGroup.append("rect")
        .attr("x", 0)
        .attr("y", 0)
        .attr("width", slidingWidth(6))
        .attr("height", windowSize.height)
        .attr("fill", "#aaaaaa")
        .attr("fill-opacity", 0.1)
        .attr("stroke", "black");

    let slidingText = slidingGroup.append("text")
        .attr("x", +slidingWindow.attr("width") /2)
        .attr("y", -8)
        .attr("text-anchor", "middle")
        .attr("font-family", "sans-serif")
        .attr("font-size", 12)
        .text(numHourAfter + " hours");

    slidingGroup
        .attr("transform", "translate(" + xScale(initTimestamp) + "," +
        (height - windowSize.height) + ")")
        .raise();

    // Dashed line for window width adjustment
    dashedGroup = g
        .append("g")
        .attr("id", "dashedGroup");

    // actual dash line
    let dashedGroupWidth = 20;
    let dashedVertical = dashedGroup
        .append("line")
        .attr("id", "dashedVertical")
        .style("stroke-width", 1)
        .style("stroke", "black")
        .style("stroke-dasharray", ("4, 2"))
        .attr("y1", 0)
        .attr("y2", margin.top)
        .attr("x1", 0)
        .attr("x2", 0);

    // overlay RECT to select
    dashedGroup.append("rect")
        .attr("id", "overlayDashedGroup")
        .attr("class", "overlay")
        .attr("width", dashedGroupWidth)
        .attr("height", margin.top)
        .attr("x", +dashedVertical.attr("x1") - dashedGroupWidth/2)
        .attr("cursor", "ew-resize");

    // translate group
    dashedGroup.attr("transform", "translate(" + (xScale(initTimestamp) + windowSize.width) +
        ","+ height + ")");

    // define drag
    // function dragstarted() {
    //     d3.select(this).classed(activeClassName, true);
    // }
    // function dragended() {
    //     d3.select(this).classed(activeClassName, false);
    // }

    function dragged() {
        let x = d3.event.x;
        let startMark = +vertical.attr("x1");
        // text.text(stepPosition(x));
        let thisGroup = d3.select(this);
        let pos = stepPosition(x, startMark);
        thisGroup.attr("transform", "translate(" + pos[0] + ","+height+")");
        numHourAfter = pos[1];
        updateWindow(current);
    }

    let drag = d3.drag()
        // .on('start', dragstarted)
        .on('drag', dragged)
        // .on('end', dragended);

    dashedGroup.call(drag);

    g.append("rect")
        .attr('class', 'overlay')
        .attr('width', width)
        .attr('height', height)
        .on("mousemove", function () {
            let mouseX = d3.mouse(this)[0];
            current = Date.parse(xScale.invert(mouseX));
            current = Math.min(Math.max(current, startDate), endDate);

            mouseX =  Math.min(Math.max(mouseX, 0), width);
            // vertical line, sliding window and tooltip
            vertical
                .attr("x1", mouseX)
                .attr("x2", mouseX);

            dashedGroup
                .attr("transform", "translate(" + (+slidingWindow.attr("width") + mouseX ) +
                    ","+ height + ")");

            slidingGroup
                .attr("transform", "translate(" + (mouseX) + "," + (height - (+slidingWindow.attr("height"))) + ")");

            tooltip.html(
                '<text class = "bold">' + formatTimeLegend(xScale.invert(mouseX)) + "</text>")
                .style("left", (mouseX + 16 + margin.left) + "px");

            // get data for ws
            updateWindow(current);

        });

}

function nearestHour(milliseconds) {
    return Date.parse(d3.timeHour.floor(new Date(milliseconds)))
}

function getRangedData(data, start, end) {
    return data.filter(d => {
        return ((start < (d.time)) &&
            ((d.time) < end))
    });
}

function getRangedDataScratch(data, start, end) {
    return data.filter(d => {
        return ((start < d.time) &&
            (d.time < end))
    });
}

function splitText(text){
    return text.toLowerCase()
        .replace(/\.|\,|\(|\)|\;|\:|\[|\]|\&|\!|\’|\?|\#|\"|\d/gi, '')
        .split(" ")
        .filter(e => {
            return stopwords.indexOf(e) < 0;
        });
}

function updateWindow(current) {
    // get data for ws
    let thisNearestHour = nearestHour(current);
    let rangedData = getRangedData(wsRawData, thisNearestHour, thisNearestHour + numHourAfter*hourToMS);
    wsData = getWSdata(rangedData);

    let streamRangedData = getRangedDataScratch(highestStack, thisNearestHour,  thisNearestHour + numHourAfter*hourToMS);
    let peak = d3.max(streamRangedData, d=>d.y);
    peak = peak !== undefined ? peak : 0;
    slidingGroup
        .attr("transform", "translate(" + (+vertical.attr("x1")) + "," + yScale(peak) + ")")
        .select("text")
        .attr("x", +slidingWindow.attr("width") /2)
        .attr("text-anchor", "middle")
        .text(numHourAfter + (numHourAfter > 1 ? " hours" : " hour"));

    slidingWindow
        .attr("height", height - yScale(peak))
        .attr("width", slidingWidth(numHourAfter));

    wsContainer.selectAll("*").remove();
    wsContainer
        .attr("width", wsContainerWidth(numHourAfter));
    wordstream(wsContainer, wsData, config);
}

function stepPosition(x, startMark){
    let value = Math.min(Math.max(Math.floor((x-startMark) / stepDash),1), 30);
    return [value * stepDash + startMark, value]
}

function styleAxis(axisNodes) {
   axisNodes.selectAll('.tick text')
       // .attr("x", 0)
       // .style("text-anchor", "start")
       .attr("fill", "#555555");
}

function updateStream() {
    //Create the stack layout for the data
    const stack = d3.stack().keys(keyList)
        .offset(d3.stackOffsetNone);

    const stacks = stack(streamRawData);
    highestStack = stacks[stacks.length-1].map(d => {
        return {
            y: d[1],
            time: d.data.time
        }
    });
    //The scales
    xScale.domain([startDate, endDate]);
    yScale.domain(d3.extent(stacks.flat().flat()));

    if ((dataOption.length === 1) && (dataOption[0].subTopic)){
        switch (dataOption[0].parent) {
            case "event":
                yScale.domain([0,125]);
                break;
            case "resource":
                yScale.domain([0,200]);
                break;
            default:
                yScale.domain([0, 800]);
        }
    }
    console.log(d3.extent(stacks.flat().flat()));
    //The y Axis
    const yAxisGroup = d3.select('#yAxis');
    const yAxis = d3.axisLeft(yScale);
    let yAxisNodes = yAxisGroup.transition().duration(1000).call(yAxis);
    styleAxis(yAxisNodes);

    //The area function used to generate path data for the area.
    const areaGen = d3.area()
        .x(d => xScale(d.data.time))
        .y0(d => yScale(d[0]))
        .y1(d => yScale(d[1]))
        .curve(d3.curveMonotoneX);

    let newchartstack = d3.select("#streamG")
        .selectAll("path").data(stacks,d=>d.key);

    let enterArr = newchartstack._enter[0];
    let enterItem = enterArr.filter(d => d !== undefined).length;
    let exitArr = newchartstack._exit[0];
    let exitItem = exitArr.filter(d => d !== undefined).length;
    let updateArr = newchartstack._groups[0];
    let updateItem = updateArr.filter(d => d !== undefined).length;

    newchartstack.exit()
        .attr("opacity", 1)
        .transition().duration(1000)
        .attr("opacity", 0)
        .remove();

    newchartstack
        .transition()
        .delay((exitItem && updateItem) ? 1000 : 0)
        .duration(1000).attr("d", areaGen)
        .attr("fill", (d, i) => {
            return taxonomy.find(d => d.id === keyList[i]).color;
        });

    newchartstack.enter()
        .append('path') .attr("class", "layer")
        .attr("opacity", 0)
        .transition()
        .delay((enterItem && updateItem)? 1000 : 0)
        .duration(1000)
        .attr("d", areaGen)
        .attr("fill", (d, i) => {
            return taxonomy.find(d => d.id === keyList[i]).color;
        })
        .attr("opacity", 1);
}

function removeChar(text){
    return "_" + text.toLowerCase()
        .replace(/\W/gi, '');
}
