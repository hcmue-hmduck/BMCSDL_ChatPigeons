const getUpdateData = (data, blackList = []) => {
    const cleanData = {}
    blackList.push('id', 'created_at', 'hasPassword');
    Object.keys(data).forEach(key => {
        if(blackList.includes(key)) return;
        const value = data[key];
        cleanData[key] = (typeof value === 'string' && value.trim() === '') ? null : value;
    })
    cleanData['updated_at'] = new Date();
    return cleanData;
}

module.exports = {
    getUpdateData
}