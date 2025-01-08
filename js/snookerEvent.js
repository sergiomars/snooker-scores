export class SnookerEvent {
    id;
    name;
    city;
    startDate;
    endDate;

    constructor(id, name, city, startDate, endDate) {
        this.id = id;
        this.name = name;
        this.city = city;
        this.startDate = startDate;
        this.endDate = endDate;
    }
}