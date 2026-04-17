FROM flyway/flyway:10

# Copy SQL migrations into the default Flyway directory
COPY db/migrations /flyway/sql

# Optional: set default command
ENTRYPOINT ["flyway"]
CMD ["migrate"]

# To build the image, run: test1

