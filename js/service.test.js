import {getArray} from "./service.js";

global.fetch = jest.fn(() =>
    Promise.resolve({
        text: () => Promise.resolve(JSON.stringify({data: '12345'})),
    })
);

beforeEach(() => {
    // if you have an existing `beforeEach` just add the following line to it
    fetchMock.doMock()
});

describe("getArray", () => {
    test('getArray_ok', async () => {
        const json = await getArray("filename");

        expect(json).toEqual({data: '12345'});
    });
});